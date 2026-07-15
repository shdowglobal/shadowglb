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

function findCompiler() {
  if (existsSync(compiler)) return compiler;
  // Fall back to a globally installed TypeScript if the local install is missing.
  try {
    const require = createRequire(import.meta.url);
    const globalTsc = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['tsc'], { encoding: 'utf8' });
    if (globalTsc.status === 0 && globalTsc.stdout.trim()) return globalTsc.stdout.trim().split('\n')[0];
    void require;
  } catch (_error) { /* fall through to the hard failure below */ }
  return null;
}

const tscPath = findCompiler();
if (!tscPath) {
  console.error('BUILD FAILED: TypeScript compiler not found. Run `pnpm install` (or `npm install`) so devDependencies are installed before building.');
  process.exit(1);
}
const isLocalCompiler = tscPath === compiler;
const result = isLocalCompiler
  ? spawnSync(process.execPath, [tscPath, '--project', 'tsconfig.json'], { cwd: root, stdio: 'inherit' })
  : spawnSync(tscPath, ['--project', 'tsconfig.json'], { cwd: root, stdio: 'inherit', shell: false });
if (result.status !== 0) {
  console.error('BUILD FAILED: TypeScript compilation returned errors.');
  process.exit(result.status ?? 1);
}

await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'src', 'styles.css'), path.join(dist, 'assets', 'styles.css'));
await writeFile(path.join(dist, 'assets', 'package.json'), '{"type":"module"}\n', 'utf8');
if (existsSync(path.join(root, 'public'))) {
  await cp(path.join(root, 'public'), dist, { recursive: true, force: true });
}

// Never ship a deploy whose JavaScript is missing — the storefront would render blank.
for (const required of ['assets/app.js', 'assets/admin.js', 'assets/styles.css', 'index.html']) {
  if (!existsSync(path.join(dist, required))) {
    console.error(`BUILD FAILED: dist/${required} is missing after the build.`);
    process.exit(1);
  }
}

console.log('Built ShadowGLB into dist/.');
