'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { generate } = require('./create-manifest.cjs');
const { validateManifest } = require('../src/updater.cjs');
const { atomicJson, sha256 } = require('../src/files.cjs');
const DEFAULT_REPOSITORY = 'kenjilaeltorres-debug/dedsafio-modpack';
async function prepareRelease(folder, output, tag, repository = DEFAULT_REPOSITORY, loader = '0.16.9', minecraft = '1.21.1') {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(tag)) throw new Error('Etiqueta no válida; usa, por ejemplo, v0.1.0.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Repositorio no válido: usuario/nombre.');
  folder = path.resolve(folder); output = path.resolve(output);
  const relation = path.relative(folder, output);
  if (!relation || (!relation.startsWith('..' + path.sep) && !path.isAbsolute(relation))) throw new Error('La carpeta de salida debe estar fuera de la carpeta del modpack.');
  try { await fs.lstat(output); throw new Error('La carpeta de salida ya existe. Usa una carpeta nueva para esta versión.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const base = `https://github.com/${repository}/releases/download/${tag}/`;
  const manifest = await generate(folder, base, tag, loader, false, minecraft);
  if (!manifest.files.length) throw new Error('No hay archivos del modpack para publicar.');
  const assets = new Map();
  for (const f of manifest.files) {
    const asset = f.sha256 + '-' + path.basename(f.path).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    if (asset.length > 220) throw new Error('Nombre de archivo demasiado largo: ' + f.path);
    assets.set(asset, f); f.url = base + encodeURIComponent(asset);
  }
  if (assets.size + 1 > 1000) throw new Error('La versión supera 1000 archivos de GitHub Releases. Agrupa los paquetes de recursos en ZIP.');
  validateManifest(manifest,minecraft);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output);
  try {
    for (const [asset, f] of assets) {
      const target = path.join(output, asset); await fs.copyFile(path.join(folder, f.path), target);
      if (await sha256(target) !== f.sha256 || (await fs.stat(target)).size !== f.size) throw new Error('El archivo cambió durante la preparación: ' + f.path);
    }
    await atomicJson(path.join(output, 'manifest.json'), manifest);
  } catch (e) { await fs.rm(output, { force: true, recursive: true }); throw e; }
  return { files: manifest.files.length, assets: assets.size + 1, output, manifestUrl: base + 'manifest.json', tag };
}
if (require.main === module) {
  const [folder, output, tag = 'v0.1.0', repository = DEFAULT_REPOSITORY, loader = '0.16.9'] = process.argv.slice(2);
  if (!folder || !output) { console.error('Uso: node scripts/create-github-release.cjs C:/mi-modpack C:/salida-v0.1.0 v0.1.0'); process.exitCode = 1; }
  else prepareRelease(folder, output, tag, repository, loader).then(r => console.log(JSON.stringify(r, null, 2) + '\nPreparado localmente. No se ha subido ni publicado nada.')).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { prepareRelease };
