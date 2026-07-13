import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else output.push(full);
  }
  return output;
}

const roots = ['src', 'api', 'scripts', 'tests'];
const files = (await Promise.all(roots.map(async (root) => {
  try { return await walk(root); } catch { return []; }
}))).flat().filter((file) => /\.(?:ts|js|mjs|css)$/.test(file));
const failures = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (/[ \t]+$/m.test(text)) failures.push(`${file}: trailing whitespace`);
  if (file.startsWith(`src${path.sep}`) && /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ShadowCapo99|\bsk_(?:live|test)_/i.test(text)) {
    failures.push(`${file}: privileged secret or retired client password reference`);
  }
  if (/\.(?:js|mjs)$/.test(file)) {
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (checked.status !== 0) failures.push(`${file}: ${checked.stderr.trim()}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Linted ${files.length} source files; secret-boundary and JavaScript syntax checks passed.`);
