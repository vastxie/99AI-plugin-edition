const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2).filter(arg => arg !== '--');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '99ai-jest-'));
const logPath = path.join(tempDir, 'output.log');
let logFd;
let activeChild;
let cleanedUp = false;
let pendingSignal;
let forceKillTimer;
let forceExitTimer;

try {
  logFd = fs.openSync(logPath, 'wx', 0o600);
} catch (error) {
  fs.rmdirSync(tempDir);
  throw error;
}

function closeLog() {
  if (logFd === undefined) {
    return;
  }

  fs.closeSync(logFd);
  logFd = undefined;
}

function cleanup() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  try {
    closeLog();
  } catch {
    // best-effort cleanup on process failure
  }
  try {
    fs.unlinkSync(logPath);
  } catch {
    // best-effort cleanup on process failure
  }
  try {
    fs.rmdirSync(tempDir);
  } catch {
    // best-effort cleanup on process failure
  }
}

process.once('exit', cleanup);

function finishSignal() {
  if (!pendingSignal) {
    return;
  }

  clearTimeout(forceKillTimer);
  clearTimeout(forceExitTimer);
  const { exitCode } = pendingSignal;
  cleanup();
  process.exit(exitCode);
}

for (const [signal, exitCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    if (pendingSignal) {
      return;
    }

    pendingSignal = { signal, exitCode };
    if (!activeChild) {
      finishSignal();
      return;
    }

    try {
      if (!activeChild.kill(signal)) {
        forceExitTimer = setTimeout(finishSignal, 1000);
        return;
      }
    } catch {
      forceExitTimer = setTimeout(finishSignal, 1000);
      return;
    }

    forceKillTimer = setTimeout(() => {
      if (!activeChild) {
        finishSignal();
        return;
      }

      try {
        activeChild.kill('SIGKILL');
      } catch {
        finishSignal();
        return;
      }

      forceExitTimer = setTimeout(finishSignal, 1000);
    }, 5000);
  });
}

function tee(readable, writable) {
  readable.on('data', chunk => {
    writable.write(chunk);
    fs.writeSync(logFd, chunk);
  });
}

function start(command, commandArgs, options) {
  const child = spawn(command, commandArgs, options);
  activeChild = child;

  const completion = new Promise((resolve, reject) => {
    child.once('error', error => {
      if (activeChild === child) {
        activeChild = undefined;
      }
      if (pendingSignal) {
        finishSignal();
      }
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = undefined;
      }
      if (pendingSignal) {
        finishSignal();
      }
      resolve({ code, signal });
    });
  });

  return { child, completion };
}

async function main() {
  const jestRun = start(process.execPath, [require.resolve('jest/bin/jest'), ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  tee(jestRun.child.stdout, process.stdout);
  tee(jestRun.child.stderr, process.stderr);

  const jestResult = await jestRun.completion;
  closeLog();

  const scanResult = await start(
    process.execPath,
    [path.join(__dirname, 'check-test-output-secrets.js'), logPath],
    { stdio: 'inherit' },
  ).completion;

  if (jestResult.code !== 0 || jestResult.signal) {
    return jestResult.code ?? 1;
  }
  return scanResult.code ?? 1;
}

main()
  .then(code => {
    cleanup();
    process.exitCode = code;
  })
  .catch(error => {
    cleanup();
    console.error(error);
    process.exitCode = 1;
  });
