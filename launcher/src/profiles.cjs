'use strict';
const path = require('node:path');
function profiles(config) {
  const custom = config.profiles || {};
  const merge=(base,extra={})=>({...base,...Object.fromEntries(Object.entries(extra).filter(([k,v])=>v!==''||!['manifestUrl','serverAddress'].includes(k)))});
  const legacy='https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/latest/download/manifest.json';
  return [
    merge({ id: 'dedsafio', name: 'DEDSAFÍO', subtitle: 'Edición Dedsafío 4', minecraft: '1.21.1', fabricLoader: config.fabricLoader || '0.19.0', manifestUrl: config.manifestUrl===legacy?'https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/download/v0.1.0/manifest.json':config.manifestUrl, serverAddress: config.serverAddress },custom.dedsafio),
    merge({ id: 'smp', name: 'MANTIS SMP', subtitle: 'Mantis SMP · Lifesteal', minecraft: '1.20.1', fabricLoader: '0.20.1', manifestUrl: 'https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/download/smp-current/manifest.json', serverAddress: '51.81.174.167:25592' },custom.smp)
  ].map(p => {
    if (!['dedsafio','smp'].includes(p.id) || !['1.21.1','1.20.1'].includes(p.minecraft) || typeof p.manifestUrl !== 'string' || typeof p.serverAddress !== 'string' || !/^\d+\.\d+\.\d+$/.test(p.fabricLoader)) throw new Error('Perfil de servidor inválido.');
    if (p.manifestUrl && new URL(p.manifestUrl).protocol !== 'https:') throw new Error('El manifiesto del perfil debe usar HTTPS.');
    return Object.freeze(p);
  });
}
function select(config, id) { const p = profiles(config).find(p=>p.id===id); if(!p)throw new Error('Servidor no válido.');return p; }
function gameRoot(root, id) { if(id==='dedsafio')return path.join(root,'minecraft');if(id==='smp')return path.join(root,'instances','smp');throw new Error('Servidor no válido.'); }
module.exports={profiles,select,gameRoot};
