import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = `Nhewr-Studios-V${version}`;
const files = {};
const include = ['app', 'components', 'creditos', 'hooks', 'lib', 'public', 'release', 'scripts', 'src', 'tests', 'vendor', '.gitattributes', '.gitignore', 'index.html', 'INICIAR.bat', 'LEIA-ME.txt', 'README.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'postcss.config.mjs', 'tsconfig.json', 'vite.local.config.ts'];

async function add(relative) {
  const absolute = path.join(root, relative);
  let entries;
  try { entries = await readdir(absolute, { withFileTypes: true }); } catch (error) {
    if (error.code !== 'ENOTDIR') throw error;
    let data = await readFile(absolute);
    if (/\.(bat|ps1)$/.test(relative)) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
    files[`${name}/${relative.replaceAll('\\', '/')}`] = new Uint8Array(data);
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in release');
    await add(path.join(relative, entry.name));
  }
}
await readFile(path.join(root, 'release/index.html'));
await readFile(path.join(root, 'creditos/TERCEIROS.txt'));
for (const entry of include) await add(entry);
const data = zipSync(files, { level: 6 });
const verified = unzipSync(data);
if (!verified[`${name}/INICIAR.bat`] || !verified[`${name}/release/index.html`]) throw new Error('Incomplete release');
if (Object.keys(verified).some(key => /\/(node_modules|\.runtime|\.git|\.openai)\//.test(key))) throw new Error('Private or machine-specific files in release');
const output = path.resolve(root, '..', `${name}.zip`);
await writeFile(output, data);
const hash = createHash('sha256').update(data).digest('hex');
await writeFile(output + '.sha256', `${hash}  ${name}.zip\n`);
console.log(`${output}\n${Object.keys(files).length} files; ${data.length} bytes\nSHA256 ${hash}`);
