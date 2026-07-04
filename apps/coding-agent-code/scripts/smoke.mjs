import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('dist/main.mjs')) {
  console.error('dist/main.mjs missing. Run `pnpm build` first.');
  process.exit(1);
}
const out = execFileSync(process.execPath, ['dist/main.mjs', '--version'], {
  encoding: 'utf8',
});
if (!out.includes('1.0.0')) {
  console.error(`unexpected --version output: ${out}`);
  process.exit(1);
}
console.log('smoke ok');
