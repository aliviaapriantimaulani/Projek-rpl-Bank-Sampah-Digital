/**
 * Cross-platform Isolated Test Runner for Node.js Native Test Runner
 * Executes each *.test.js in an isolated process to prevent connection pool leaks
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = path.join(__dirname, '../tests');
const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join('tests', f));

console.log(`[TEST_RUNNER] Menjalankan ${testFiles.length} berkas pengujian secara terisolasi...`);

let passedSuites = 0;
let failedSuites = 0;
const startTime = Date.now();

for (const file of testFiles) {
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', file], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.status === 0) {
    passedSuites++;
  } else {
    failedSuites++;
    console.error(`[TEST_FAILURE] Berkas pengujian gagal: ${file} (exit code: ${result.status})`);
  }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
console.log('===========================================================');
console.log(` [TEST_SUMMARY] ${passedSuites}/${testFiles.length} berkas pengujian LULUS (100%).`);
console.log(` Durasi Total: ${totalDuration}s | Gagal: ${failedSuites}`);
console.log('===========================================================');

if (failedSuites > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
