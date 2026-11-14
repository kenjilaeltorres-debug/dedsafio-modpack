'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { cleanPath, safeTarget, httpUrl, sha256, atomicJson, download } = require('./files.cjs');
function validateManifest(m, minecraft='1.21.1') {
  if (!m || m.example === true || m.schema !== 1 || typeof m.version !== 'string' || m.version.length > 100 || !Array.isArray(m.files) || m.files.length > 5000 || m.minecraft !== minecraft || !/^\d+\.\d+\.\d+$/.test(m.fabricLoader)) throw new Error('Manifiesto incompatible o de ejemplo. Se requiere un manifiesto publicado para la versión del perfil seleccionado.');
  const seen = new Set(); let bytes = 0;
  for (const f of m.files) {
    cleanPath(f.path); httpUrl(f.url);
    if (seen.has(f.path.toLowerCase())) throw new Error('Ruta duplicada en el manifiesto.'); seen.add(f.path.toLowerCase());
    if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > 512 * 1024 * 1024 || !['managed', 'seed'].includes(f.mode)) throw new Error('Archivo del manifiesto no válido.');
    if (f.path.startsWith('config/') && f.mode !== 'seed') throw new Error('Las configuraciones se entregan sólo como iniciales para conservar cambios.');
    bytes += f.size;
  }
  if (bytes > 8 * 1024 ** 3) throw new Error('El modpack supera el límite de 8 GiB.');
  return m;
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function syncPack(root, manifest, progress = () => {}, { bundled = new Map(), retired = [], minecraft = '1.21.1' } = {}) {
  validateManifest(manifest,minecraft); await fs.mkdir(root, { recursive: true });
  const lockPath = path.join(root, '.dedsafio-update.lock'); let lock;
  try { lock = await fs.open(lockPath, 'wx'); } catch { throw new Error('Existe una actualización en curso. Si el launcher se cerró inesperadamente, revisa y retira .dedsafio-update.lock con el juego cerrado.'); }
  await lock.writeFile(String(process.pid));
  const stage = path.join(root, '.dedsafio-staging-' + crypto.randomUUID());
  const backup = path.join(root, '.dedsafio-backups', Date.now() + '-' + crypto.randomUUID());
  const stateFile = path.join(root, '.dedsafio-managed.json');
  let previous = { files: [] }; const installed = [], moved = []; let committed = false;
  try {
    try { previous = JSON.parse(await fs.readFile(stateFile, 'utf8')); if (!Array.isArray(previous.files)) throw new Error(); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Registro de actualización dañado; conserva una copia y revisa .dedsafio-managed.json.'); }
    for (const f of previous.files) cleanPath(f.path);
    const updates = [];
    for (const f of manifest.files) {
      const target = await safeTarget(root, f.path);
      if (await exists(target)) { if (f.mode === 'seed' || await sha256(target) === f.sha256) continue; }
      updates.push(f);
    }
    await fs.mkdir(stage, { recursive: true });
    for (let i = 0; i < updates.length; i++) {
      const f = updates[i]; progress({ phase: 'download', file: f.path, current: i, total: updates.length });
      const dest = path.join(stage, f.path);
      const local = bundled.get(f.path);
      if (local) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(local, dest);
        if ((await fs.stat(dest)).size !== f.size || await sha256(dest) !== f.sha256)
          throw new Error('Archivo incluido dañado: ' + f.path);
      } else {
        await download(f.url, dest, f.sha256, f.size, (bytes, totalBytes) => progress({ phase: 'download', file: f.path, current: i, total: updates.length, bytes, totalBytes }));
      }
    }
    // All downloads have passed verification before touching the active modpack.
    const nextPaths = new Set(manifest.files.map(f => f.path.toLowerCase()));
    const retiredPaths = new Map();
    for (const f of previous.files.filter(f => f.mode === 'managed')) retiredPaths.set(f.path.toLowerCase(), f.path);
    for (const relative of retired) {
      cleanPath(relative);
      retiredPaths.set(relative.toLowerCase(), relative);
    }
    const obsolete = [];
    for (const [key, relative] of retiredPaths) {
      if (!nextPaths.has(key) && await exists(await safeTarget(root, relative))) obsolete.push({ path: relative });
    }
    for (const f of [...updates, ...obsolete]) {
      const target = await safeTarget(root, f.path);
      if (await exists(target)) { const destination = path.join(backup, f.path); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.rename(target, destination); moved.push({ target, destination }); }
      if (updates.includes(f)) { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.rename(path.join(stage, f.path), target); installed.push(target); }
    }
    await atomicJson(stateFile, { version: manifest.version, updated: new Date().toISOString(), files: manifest.files.map(({ path, mode, sha256 }) => ({ path, mode, sha256 })) });
    committed = true;
    progress({ phase: 'ready', current: updates.length, total: updates.length, version: manifest.version });
    return { updated: updates.length, retired: obsolete.length, version: manifest.version, backup: moved.length ? backup : null };
  } catch (e) {
    if (!committed) { for (const file of installed.reverse()) await fs.rm(file, { force: true }); for (const { target, destination } of moved.reverse()) await fs.rename(destination, target); }
    throw e;
  } finally { await fs.rm(stage, { force: true, recursive: true }); await lock.close(); await fs.rm(lockPath, { force: true }); }
}
module.exports = { validateManifest, syncPack };
