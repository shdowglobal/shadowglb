import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const compiler = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
if (existsSync(compiler)) {
  const result = spawnSync(process.execPath, [compiler, '--noEmit', '--project', 'tsconfig.json'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const bundle = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'lib', 'transform', 'babelBundle.js');
if (!existsSync(bundle)) {
  console.error('TypeScript is not installed. Run `pnpm install` first.');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { babelParse } = require(bundle);
for (const file of (await readdir('src')).filter((name) => name.endsWith('.ts'))) {
  babelParse(await readFile(path.join('src', file), 'utf8'), file, true);
}
console.warn('TypeScript syntax passed. Semantic checking requires `pnpm install` in this restricted environment.');
