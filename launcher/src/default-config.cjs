'use strict';
// Embedded fallback: a .cjs module so extraFiles cannot remove it from app.asar.
module.exports = {
  launcherUpdateUrl: 'https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/download/launcher-current/',
  profiles: { smp: { manifestUrl: '', serverAddress: '' } },
  brand: 'MANTIS ESTUDIO',
  subtitle: 'Edición Dedsafio 4',
  manifestUrl: 'https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/latest/download/manifest.json',
  serverAddress: 'FABRESAFIO.exaroton.me:54470',
  microsoftClientId: '',
  microsoftRedirect: 'https://login.live.com/oauth20_desktop.srf',
  allowLocalProfiles: true,
  minecraftVersion: '1.21.1',
  fabricLoader: '0.19.0',
  news: [
    { tag: 'COMUNIDAD', title: 'Un mundo, dos desafíos', body: 'La recreación que une nuestra aventura. El launcher organiza tu instalación y las próximas actualizaciones.' },
    { tag: 'PRIMER ACCESO', title: 'Todo en su sitio', body: 'Revisa el modpack antes de jugar. Tus mundos, capturas y controles se conservan.' }
  ]
};
