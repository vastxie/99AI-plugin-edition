'use strict';

// This gate must pass before the narrowly scoped, locally-patched GHSA exception.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const MAX_DEPTH = 128;
const message = `Input nesting exceeds max depth (${MAX_DEPTH})`;
const depthError = error => error instanceof SyntaxError && error.message === message;

function deepAst(depth) {
  let node = { type: 'text', value: 'x' };
  for (let i = 0; i < depth; i++) {
    const parent = { type: 'paren', nodes: [{ type: 'text', value: '(' }, node, { type: 'text', value: ')' }] };
    node.parent = parent;
    node = parent;
  }
  const root = { type: 'root', nodes: [node] };
  node.parent = root;
  return root;
}

function verifyPackage(directory) {
  const b = require(directory);
  assert.equal(require(path.join(directory, 'package.json')).version, '3.0.3',
    'Review the patch and remove its audit exception when changing braces versions');
  const lib = name => require(path.join(directory, 'lib', name));
  const patterns = [
    '{'.repeat(4800) + 'a,b' + '}'.repeat(4800),
    '('.repeat(4800) + 'x' + ')'.repeat(4800),
    '{('.repeat(2000) + 'a,b' + ')}'.repeat(2000),
    '{'.repeat(4000) + 'a,b',
    '('.repeat(4000) + 'x',
    '{1..' + '('.repeat(1800) + 'x' + ')'.repeat(1800) + ',x}',
  ];
  const options = { maxLength: Infinity, maxDepth: Infinity, rangeLimit: false };
  const entries = [
    p => b(p, options),
    p => b([p], { ...options, expand: true }),
    p => b.create(p, options),
    p => b.parse(p, options),
    p => b.compile(p, options),
    p => b.expand(p, options),
    p => b.stringify(p, options),
    p => lib('parse')(p, options),
  ];
  for (const pattern of patterns) {
    assert.ok(pattern.length < 10000, 'Regression input must be below the existing length cap');
    for (const entry of entries) assert.throws(() => entry(pattern), depthError);
  }
  for (const method of ['compile', 'expand', 'stringify']) {
    assert.throws(() => b[method](deepAst(600)), depthError, `${method}: direct AST`);
    assert.throws(() => lib(method)(deepAst(600)), depthError, `${method}: low-level AST`);
    const cycle = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => b[method](cycle), depthError, `${method}: child cycle`);
  }
  const parentCycle = b.parse('(x)');
  const paren = parentCycle.nodes.find(node => node.type === 'paren');
  paren.parent = paren;
  assert.throws(() => b.expand(parentCycle), depthError, 'expand: parent cycle');

  const boundary = '('.repeat(MAX_DEPTH - 1) + 'x' + ')'.repeat(MAX_DEPTH - 1);
  for (const method of ['compile', 'expand', 'stringify']) assert.doesNotThrow(() => b[method](boundary));
  assert.throws(() => b.parse('('.repeat(MAX_DEPTH) + 'x' + ')'.repeat(MAX_DEPTH)), depthError);
  assert.doesNotThrow(() => b.compile(deepAst(MAX_DEPTH - 1)));
  assert.throws(() => b.compile(deepAst(MAX_DEPTH)), depthError);
  assert.deepEqual(b.expand('src/{api,ui}/file-{1..3}.ts'), [
    'src/api/file-1.ts', 'src/api/file-2.ts', 'src/api/file-3.ts',
    'src/ui/file-1.ts', 'src/ui/file-2.ts', 'src/ui/file-3.ts',
  ]);
  assert.deepEqual(b.expand('{a,{b,c}}'), ['a', 'b', 'c']);
  assert.deepEqual(b.expand('{01..03}'), ['01', '02', '03']);
  assert.deepEqual(b.expand('{,a,a}', { noempty: true, nodupes: true }), ['a']);
  assert.deepEqual(b.expand('src/**/*.{vue,ts,tsx,js,jsx}'),
    ['vue', 'ts', 'tsx', 'js', 'jsx'].map(ext => `src/**/*.${ext}`));
  for (const pattern of ['${a,{b,c}}', '{a,b', '[a{b}]']) {
    assert.equal(b.compile(pattern), pattern);
  }
  for (const pattern of ['"' + '{('.repeat(200) + '"', '[' + '{('.repeat(200) + ']']) {
    assert.equal(b.compile(pattern, { keepQuotes: true }), pattern);
  }
  const escaped = '\\{'.repeat(200);
  assert.equal(b.compile(escaped, { keepEscaping: true }), escaped);
  assert.equal(b.compile('{a,b', { escapeInvalid: true }), '\\{a,b');
  assert.throws(() => b.expand('{1..1001}'), error => error instanceof RangeError && /range limit/.test(error.message));
  assert.throws(() => b.parse('1234', { maxLength: 3 }), error => error instanceof SyntaxError && /max characters/.test(error.message));
}

function installedCopies(cwd) {
  // Follow installed package links, not pnpm's stale/unreferenced store folders.
  // This also supports chat's hoisted linker, whose pnpm list paths are virtual.
  const pending = [path.join(cwd, 'node_modules'), path.join(cwd, 'node_modules/.pnpm/node_modules')];
  const modules = new Set();
  const packages = new Set();
  const copies = new Set();
  function inspect(directory) {
    if (!fs.existsSync(path.join(directory, 'package.json'))) return;
    const real = fs.realpathSync(directory);
    if (packages.has(real)) return;
    packages.add(real);
    const manifest = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
    if (manifest.name === 'braces') copies.add(real);
    pending.push(path.join(real, 'node_modules'));
    let parent = path.dirname(real);
    while (parent !== path.dirname(parent) && path.basename(parent) !== 'node_modules') parent = path.dirname(parent);
    if (path.basename(parent) === 'node_modules') pending.push(parent);
  }
  while (pending.length) {
    const directory = pending.pop();
    if (!fs.existsSync(directory)) continue;
    const real = fs.realpathSync(directory);
    if (modules.has(real)) continue;
    modules.add(real);
    for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const child = path.join(real, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scoped of fs.readdirSync(child)) inspect(path.join(child, scoped));
      } else {
        inspect(child);
      }
    }
  }
  assert.ok(copies.size > 0, 'No installed braces copy was checked; review/remove the audit exception');
  return copies;
}

async function verifyConsumers(cwd) {
  const project = createRequire(path.join(cwd, 'package.json'));
  const name = project('./package.json').name;
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'braces-consumer-'));
  try {
    for (const file of ['sample.ts', 'sample.js', 'ignored.txt']) fs.writeFileSync(path.join(fixture, file), 'fixture');
    if (name.endsWith('-admin')) {
      const glob = project('fast-glob');
      assert.deepEqual(glob.sync('*.{ts,js}', { cwd: fixture }).sort(), ['sample.js', 'sample.ts']);
    } else {
      const owner = name.endsWith('-service') ? '@nestjs/cli' : 'tailwindcss';
      const consumer = createRequire(project.resolve(`${owner}/package.json`));
      const watcher = consumer('chokidar').watch(path.join(fixture, '*.{ts,js}'), { persistent: false, usePolling: true });
      const added = [];
      watcher.on('add', file => added.push(path.basename(file)));
      let timer;
      try {
        await new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Glob watcher did not become ready')), 10000);
          watcher.once('error', reject);
          watcher.once('ready', resolve);
        });
        assert.deepEqual(added.sort(), ['sample.js', 'sample.ts']);
      } finally {
        clearTimeout(timer);
        await watcher.close();
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

if (require.main === module) {
  (async () => {
    const cwd = process.cwd();
    const copies = installedCopies(cwd);
    for (const directory of copies) verifyPackage(directory);
    await verifyConsumers(cwd);
    console.log(`braces patch verified: ${copies.size} active copy/copies; attack inputs, ASTs, limits and glob consumer passed.`);
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { verifyPackage, installedCopies };
