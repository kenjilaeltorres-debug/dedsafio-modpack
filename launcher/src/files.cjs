'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
function httpUrl(value) {
  const u = new URL(value);
  if (u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))) throw new Error('Se requiere HTTPS (HTTP sólo en localhost).');
  return u;
}
function cleanPath(value) {
  if (typeof value !== 'string' || value.length > 220 || !/^[a-zA-Z0-9_./ +@()-]+$/.test(value) || value.includes('\\') || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw new Error(`Ruta no válida: ${value}`);
  if (!['mods', 'resourcepacks', 'shaderpacks', 'config'].includes(value.split('/')[0]) || value.split('/').length < 2) throw new Error(`Carpeta no administrable: ${value}`);
  return value;
}
async function safeTarget(root, relative) {
  cleanPath(relative);
  const resolved = path.resolve(root, relative);
  for (let p = resolved; p !== path.resolve(root); p = path.dirname(p)) {
    try { if ((await fs.lstat(p)).isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${relative}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('La carpeta del juego no puede ser un enlace.');
  return resolved;
}
async function sha256(file) {
  const h = crypto.createHash('sha256');
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest('hex');
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + crypto.randomUUID();
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  try { await fs.rename(tmp, file); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
}
async function fetchSafe(url, options = {}) {
  let u = httpUrl(url);
  for (let redirects = 0; redirects < 8; redirects++) {
    const r = await fetch(u, { ...options, redirect: 'manual', signal: options.signal || AbortSignal.timeout(90000) });
    if ([301, 302, 303, 307, 308].includes(r.status)) { const next = r.headers.get('location'); await r.body?.cancel(); if (!next) throw new Error('Redirección sin destino.'); u = httpUrl(new URL(next, u).href); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`Descarga HTTP ${r.status}: ${u.hostname}`); }
    return r;
  }
  throw new Error('Demasiadas redirecciones.');
}
async function fetchJson(url, max = 4 * 1024 * 1024) {
  const r = await fetchSafe(url); const chunks = []; let bytes = 0;
  for await (const b of Readable.fromWeb(r.body)) { bytes += b.length; if (bytes > max) { await r.body?.cancel().catch(() => {}); throw new Error('El JSON excede el límite.'); } chunks.push(b); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function download(url, dest, expected, size, progress = () => {}) {
  const r = await fetchSafe(url, { signal: AbortSignal.timeout(15 * 60 * 1000) }); await fs.mkdir(path.dirname(dest), { recursive: true });
  const hash = crypto.createHash('sha256'); let total = 0;
  const limit = Number.isSafeInteger(size) ? size : 600 * 1024 * 1024;
  const transform = new Transform({ transform(chunk, _, cb) { total += chunk.length; if (total > limit) return cb(new Error('Tamaño descargado mayor al esperado.')); hash.update(chunk); progress(total, size); cb(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(r.body), transform, createWriteStream(dest, { flags: 'wx', mode: 0o600 }));
    if ((size !== undefined && total !== size) || hash.digest('hex') !== expected) throw new Error('El archivo no coincide con su tamaño o SHA-256.');
  } catch (e) { await fs.rm(dest, { force: true }); throw e; }
}
module.exports = { httpUrl, cleanPath, safeTarget, sha256, atomicJson, fetchJson, download };
