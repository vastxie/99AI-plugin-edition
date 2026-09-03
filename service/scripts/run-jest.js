const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2).filter(arg => arg !== '--');
const logPath = path.join(os.tmpdir(), `99ai-jest-${process.pid}.log`);
const logFd = fs.openSync(logPath, 'w');

function tee(readable, writable) {
  readable.on('data', chunk => {
    writable.write(chunk);
    fs.writeSync(logFd, chunk);
  });
}

const child = spawn('jest', args, {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
});

tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on('error', err => {
  try {
    fs.closeSync(logFd);
  } catch {
    // already closed
  }
  try {
    fs.unlinkSync(logPath);
  } catch {
    // ignore cleanup errors
  }
  console.error(err);
  process.exit(1);
});

child.on('close', code => {
  fs.closeSync(logFd);

  const scan = spawn(
    process.execPath,
    [path.join(__dirname, 'check-test-output-secrets.js'), logPath],
    { stdio: 'inherit' },
  );

  scan.on('close', scanCode => {
    try {
      fs.unlinkSync(logPath);
    } catch {
      // ignore cleanup errors
    }
    if (code !== 0) {
      process.exit(code ?? 1);
    }
    process.exit(scanCode ?? 1);
  });
});
