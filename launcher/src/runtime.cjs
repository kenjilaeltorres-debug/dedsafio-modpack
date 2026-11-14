'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { fetchJson, download } = require('./files.cjs');
const exec = promisify(execFile);
async function java21(file) { try { const r = await exec(file, ['-version'], { timeout: 10000, windowsHide: true }); return /version\s+"21(?:\.|"|\+)/.test(r.stderr + r.stdout); } catch { return false; } }
async function ensureJava(root, manual, progress = () => {}) {
  if (manual) { if (!await java21(manual)) throw new Error('El ejecutable elegido no es Java 21.'); return manual; }
  const runtime = path.join(root, 'runtime', 'java21');
  async function locate(dir) { try { for (const f of await fs.readdir(dir, { withFileTypes: true })) if (f.isDirectory() && !f.isSymbolicLink()) { const candidate = path.join(dir, f.name, 'bin', 'java.exe'); if (await java21(candidate)) return candidate; } } catch {} return null; }
  const found = await locate(runtime); if (found) return found;
  if (await java21('java')) return 'java';
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Selecciona un Java 21 instalado. La instalación automática de esta versión es para Windows x64.');
  progress({ phase: 'java', file: 'Buscando Java 21 oficial…' });
  const versions = await fetchJson('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse');
  const pkg = versions?.[0]?.binary?.package;
  if (!pkg || !/^[a-f0-9]{64}$/.test(pkg.checksum) || !Number.isSafeInteger(pkg.size) || pkg.size > 300 * 1024 * 1024 || !pkg.name.endsWith('.zip')) throw new Error('Respuesta inesperada del proveedor de Java.');
  const temp = path.join(root, 'runtime', 'download-' + require('node:crypto').randomUUID()); await fs.mkdir(temp, { recursive: true });
  try {
    const archive = path.join(temp, 'java.zip'); await download(pkg.link, archive, pkg.checksum, pkg.size, (bytes, totalBytes) => progress({ phase: 'java', bytes, totalBytes, file: 'Descargando Java 21…' }));
    const destination = path.join(temp, 'extracted'); await require('extract-zip')(archive, { dir: destination });
    const java = await locate(destination); if (!java) throw new Error('Java descargado no superó la comprobación.');
    await fs.mkdir(path.dirname(runtime), { recursive: true }); await fs.rm(runtime, { recursive: true, force: true }); await fs.rename(destination, runtime);
    return await locate(runtime);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
module.exports = { ensureJava, java21 };
