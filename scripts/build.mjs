import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const tsc = 'node_modules/typescript/bin/tsc';
execFileSync(process.execPath, [tsc], { stdio: 'inherit' });
execFileSync(process.execPath, [tsc, '--module', 'CommonJS', '--outDir', 'dist/cjs'], {
  stdio: 'inherit',
});
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
copyFileSync('src/styles.css', 'dist/styles.css');
