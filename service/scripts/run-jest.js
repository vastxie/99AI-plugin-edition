const { spawnSync } = require('child_process');

const args = process.argv.slice(2).filter(arg => arg !== '--');
const result = spawnSync('jest', args, { stdio: 'inherit', shell: true });

process.exit(result.status ?? 1);
