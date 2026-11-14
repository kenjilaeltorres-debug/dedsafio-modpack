'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = require('./default-config.cjs');
function loadConfig({ packaged, exePath = process.execPath, developmentPath = path.join(__dirname, '../launcher.config.json') }) {
  const file = packaged ? path.join(path.dirname(exePath), 'launcher.config.json') : developmentPath;
  let custom = {};
  try { custom = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('No se pudo leer ' + file + ': revisa que contenga JSON válido.'); }
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) throw new Error('launcher.config.json debe contener un objeto JSON.');
  const config = { ...defaults, ...custom };
  for (const key of ['brand', 'subtitle', 'manifestUrl', 'serverAddress', 'microsoftClientId', 'microsoftRedirect']) if (typeof config[key] !== 'string') throw new Error(key + ' debe ser un texto entre comillas.');
  if (typeof config.allowLocalProfiles !== 'boolean' || !Array.isArray(config.news)) throw new Error('allowLocalProfiles debe ser true/false y news debe ser una lista.');
  if(!config.launcherUpdateUrl||config.launcherUpdateUrl==='https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/latest/download/')config.launcherUpdateUrl=defaults.launcherUpdateUrl;
  require('./profiles.cjs').profiles(config);
  if(config.launcherUpdateUrl&&new URL(config.launcherUpdateUrl).protocol!=='https:')throw new Error('El canal de actualización debe usar HTTPS.');
  return config;
}
module.exports = { loadConfig };
