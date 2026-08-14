const fs = require('node:fs');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/check-test-output-secrets.js /path/to/test.log');
  process.exit(64);
}

const content = fs.readFileSync(inputPath, 'utf8');
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['authorization header', /authorization\s*[:=]\s*(?:bearer|basic)\s+[A-Za-z0-9._~+\/-]{8,}/gi],
  ['password field', /(?:password|passwd)\s*[:=]\s*["'][^"'\r\n]{6,}["']/gi],
];

const findings = [];
for (const [label, pattern] of patterns) {
  const matches = content.match(pattern) || [];
  if (matches.length > 0) {
    findings.push(`${label}: ${matches.length}`);
  }
}

if (findings.length > 0) {
  console.error(`Potential secrets found in test output: ${findings.join(', ')}`);
  process.exit(1);
}

console.log('Test output secret scan passed.');
