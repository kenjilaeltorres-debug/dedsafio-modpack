'use strict';
const crypto = require('node:crypto');
function localProfile(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('El nombre local debe tener 3–16 letras, números o guiones bajos.');
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; hash[8] = (hash[8] & 0x3f) | 0x80;
  return { access_token: '0', client_token: crypto.randomUUID(), uuid: hash.toString('hex'), name, user_properties: '{}', meta: { type: 'mojang', demo: false } };
}
function redact(text) {
  return String(text).replace(/(--accessToken\s+)[^\s]+/gi, '$1[OCULTO]').replace(/((?:access_token|refresh_token|client_token|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[OCULTO]').replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [OCULTO]');
}
function createAuth(config,Auth){return config.microsoftClientId?new Auth({client_id:config.microsoftClientId,redirect:config.microsoftRedirect,prompt:'select_account'}):new Auth('select_account');}
module.exports = { localProfile, redact, createAuth };
