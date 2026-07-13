import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const dist = path.join(root, 'dist');
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

if (existsSync(compiler)) {
  const result = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.json'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  const bundle = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'lib', 'transform', 'babelBundle.js');
  if (!existsSync(bundle)) {
    console.error('TypeScript is not installed. Run `pnpm install` first.');
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const { babelTransform } = require(bundle);
  const sourceDir = path.join(root, 'src');
  const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.ts'));
  for (const file of files) {
    const input = await readFile(path.join(sourceDir, file), 'utf8');
    const transformed = babelTransform(input, file, true, [], []);
    if (!transformed?.code) throw new Error(`Could not transpile ${file}`);
    await writeFile(path.join(dist, 'assets', file.replace(/\.ts$/, '.js')), transformed.code, 'utf8');
  }
  console.warn('Built with the bundled TypeScript transpiler; run `pnpm typecheck` with dependencies installed before release.');
}

await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'src', 'styles.css'), path.join(dist, 'assets', 'styles.css'));
await writeFile(path.join(dist, 'assets', 'package.json'), '{"type":"module"}\n', 'utf8');
if (existsSync(path.join(root, 'public'))) {
  await cp(path.join(root, 'public'), dist, { recursive: true, force: true });
}

console.log('Built ShadowGLB into dist/.');
