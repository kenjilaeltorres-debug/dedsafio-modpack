'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { sha256, httpUrl, cleanPath, atomicJson } = require('../src/files.cjs');
const { validateManifest } = require('../src/updater.cjs');
async function generate(folder, baseUrl, version, fabricLoader = '0.16.9', writeOutput = true, minecraft = '1.21.1') {
  folder = path.resolve(folder); const base = httpUrl(baseUrl); if (!base.pathname.endsWith('/')) base.pathname += '/';
  const files = [];
  async function walk(dir) {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.')) continue;
      if (item.isSymbolicLink()) throw new Error('No se publican enlaces simbólicos.');
      const file = path.join(dir, item.name); if (item.isDirectory()) { await walk(file); continue; }
      const relative = path.relative(folder, file).split(path.sep).join('/'); cleanPath(relative);
      if (relative.startsWith('mods/') && !relative.toLowerCase().endsWith('.jar')) continue;
      if (!item.isFile()) throw new Error('Tipo de archivo no admitido.');
      files.push({ path: relative, url: new URL(relative.split('/').map(encodeURIComponent).join('/'), base).href, size: (await fs.stat(file)).size, sha256: await sha256(file), mode: relative.startsWith('config/') ? 'seed' : 'managed' });
    }
  }
  // Only explicit content folders: no accounts, saves, options or screenshots.
  for (const dir of ['mods', 'resourcepacks', 'shaderpacks', 'config']) {
    const target = path.join(folder, dir); let stat;
    try { stat = await fs.lstat(target); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('La carpeta de contenido no puede ser un enlace ni un archivo: ' + dir);
    await walk(target);
  }
  const manifest = validateManifest({ schema: 1, version, minecraft, fabricLoader, files }, minecraft);
  if (writeOutput) await atomicJson(path.join(folder, 'manifest.json'), manifest); return manifest;
}
if (require.main === module) {
  const [folder, url, version, loader] = process.argv.slice(2);
  if (!folder || !url || !version) { console.error('Uso: npm run manifest -- ./modpack https://tu-dominio/pack/ 0.1.0 [0.16.9]'); process.exitCode = 1; }
  else generate(folder, url, version, loader).then(m => console.log(`Manifiesto creado: ${m.files.length} archivos. No se ha publicado nada.`)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { generate };
