'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { atomicJson, fetchJson } = require('./files.cjs');
const { syncPack, validateManifest } = require('./updater.cjs');
const { withBundledMods } = require('./bundled-pack.cjs');
const Profiles=require('./profiles.cjs');
let launcherUpdate, quittingForUpdate=false;
function selected(){return Profiles.select(config,settings.selectedServer||'dedsafio');}
function selectedRoot(){return Profiles.gameRoot(root,selected().id);}
const { ensureJava } = require('./runtime.cjs');
const { localProfile, redact, createAuth } = require('./auth.cjs');
// Keep the previous Windows data directory when changing the product name.
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Dedsafio Launcher'));
let config, bootError;
try { config = require('./config.cjs').loadConfig({ packaged: app.isPackaged }); }
catch (e) { bootError = e; config = require('./default-config.cjs'); }
let win, root, settings = { memory: 6, localName: '', javaPath: '' }, account = null, mc = null, xbox = null, busy = false, game = null;
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on('second-instance', () => { win?.show(); win?.focus(); });
function emit(data) { if (!win?.isDestroyed()) win?.webContents.send('event', data); }
function publicAccount() { return account ? { name: account.name, uuid: account.uuid } : null; }
async function log(message) { const clean = redact(message).slice(0, 12000); emit({ type: 'log', message: clean }); await fs.appendFile(path.join(root, 'launcher.log'), new Date().toISOString() + ' ' + clean + '\n').catch(() => {}); }
function authManager() { return createAuth(config, require('msmc').Auth); }
async function finishLogin(manager) {
  const token = await manager.getMinecraft();
  const entitlements = await token.entitlements();
  if (!token.profile?.id || token.isDemo() || !entitlements.some(x => ['game_minecraft', 'product_minecraft'].includes(x))) throw new Error('La cuenta no tiene un acceso válido a Minecraft Java.');
  xbox = manager; mc = token; account = token.mclc();
  if (safeStorage.isEncryptionAvailable()) await fs.writeFile(path.join(root, 'session.bin'), safeStorage.encryptString(manager.save()), { mode: 0o600 });
  emit({ type: 'account', account: publicAccount() }); return publicAccount();
}
async function guard(task) {
  if (busy || game) throw new Error(game ? 'Cierra Minecraft antes de actualizar o cambiar la sesión.' : 'Hay otra operación en curso.');
  busy = true; emit({ type: 'busy', busy: true });
  try { return await task(); } catch (e) { await log('ERROR: ' + (e.message || 'Operación no completada.')); throw e; }
  finally { busy = false; emit({ type: 'busy', busy: false }); }
}
async function updatePack() {
  const server=selected();
  if(!server.manifestUrl)throw new Error('El perfil SMP está preparado. Falta publicar su modpack antes de habilitar Jugar.');

  emit({ type: 'progress', phase: 'check', file: 'Comprobando versión del modpack…' });
  const published = validateManifest(await fetchJson(server.manifestUrl),server.minecraft);
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'bundled-mods') : path.join(__dirname, '../bundled-mods');
  const { manifest, options } = server.id==='dedsafio'?withBundledMods(published, directory):{manifest:published,options:{}};options.minecraft=server.minecraft;
  let last = 0;
  const result = await syncPack(selectedRoot(), manifest, p => { if (Date.now() - last > 100 || p.phase === 'ready') { last = Date.now(); emit({ type: 'progress', ...p }); } }, options);
  await log(`Modpack ${manifest.version}: ${result.updated} archivos actualizados; ${result.retired} retirados a respaldo.`);
  return manifest;
}
async function play(options) {
  if (!options || !['microsoft', 'local'].includes(options.mode)) throw new Error('Modo de cuenta no válido.');
  let authorization;
  if (options.mode === 'local') {
    if (!config.allowLocalProfiles) throw new Error('Los perfiles locales están deshabilitados.');
    authorization = localProfile(options.name); settings.localName = authorization.name;
  } else {
    if (!mc) throw new Error('Inicia sesión con Microsoft primero.');
    await mc.refresh(false); authorization = mc.mclc();
    if (xbox && safeStorage.isEncryptionAvailable()) await fs.writeFile(path.join(root, 'session.bin'), safeStorage.encryptString(xbox.save()), { mode: 0o600 });
  }
  await atomicJson(path.join(root, 'settings.json'), settings);
  const server=selected();
  const manifest = await updatePack();
  const java = await ensureJava(root, settings.javaPath, p => emit({ type: 'progress', ...p }));
  const profile = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${server.minecraft}/${manifest.fabricLoader}/profile/json`);
  if (typeof profile.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(profile.id) || profile.inheritsFrom !== server.minecraft) throw new Error('Perfil Fabric no válido.');
  const gameRoot = selectedRoot();
  await atomicJson(path.join(gameRoot, 'versions', profile.id, profile.id + '.json'), profile);
  const { Client } = require('minecraft-launcher-core'); const client = new Client();
  client.on('progress', p => emit({ type: 'progress', phase: 'minecraft', file: 'Preparando Minecraft y bibliotecas…', current: p.task, total: p.total }));
  client.on('data', message => void log(message));
  client.on('debug', message => { const text = String(message); if (!/launching with arguments|authorization|access_token|client_token/i.test(text)) void log(text); });
  client.on('close', code => { game = null; emit({ type: 'game', running: false }); void log('Minecraft terminó con código ' + code); win?.show(); });
  emit({ type: 'progress', phase: 'launch', file: 'Iniciando Minecraft…' });
  const opts = { root: gameRoot, authorization, javaPath: java, version: { number: server.minecraft, type: 'release', custom: profile.id }, memory: { max: settings.memory + 'G', min: '1G' }, window: { width: 1280, height: 720 } };
  if(server.id==='smp')opts.quickPlay={type:'multiplayer',identifier:server.serverAddress};
  game = await client.launch(opts);
  if (!game || !game.pid) { game = null; throw new Error('Minecraft no pudo iniciarse. Revisa los registros.'); }
  game.once('error', e => { game = null; emit({ type: 'game', running: false }); void log(e.message); });
  emit({ type: 'game', running: true }); return { pid: game.pid };
}
async function setup() {
  root = app.getPath('userData'); await fs.mkdir(root, { recursive: true });
  try { const s = JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8')); settings = { ...settings, ...s }; } catch {}
  if(!['dedsafio','smp'].includes(settings.selectedServer))settings.selectedServer='dedsafio';
  settings.memory = Math.max(2, Math.min(16, Math.floor(os.totalmem() / 1024 ** 3) - 2, Number(settings.memory) || 6));
  win = new BrowserWindow({ width: 1240, height: 830, minWidth: 1020, minHeight: 720, title: 'Mantis Studio', icon: path.join(__dirname, '../ui/assets/mantis.ico'), backgroundColor: '#101512', autoHideMenuBar: true, webPreferences: { autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => { if (!quittingForUpdate&&(busy || game)) { e.preventDefault(); void dialog.showMessageBox(win, { type: 'info', message: 'Cierra Minecraft y espera a que termine la operación actual antes de salir.' }); } });
  const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origen no permitido.'); return fn(...args); });
  const publicState=()=>({config:{brand:config.brand,subtitle:selected().subtitle,serverAddress:selected().serverAddress,configured:Boolean(selected().manifestUrl),microsoftConfigured:true,allowLocalProfiles:config.allowLocalProfiles,news:config.news},profiles:Profiles.profiles(config).map(p=>({id:p.id,name:p.name,subtitle:p.subtitle,minecraft:p.minecraft,configured:Boolean(p.manifestUrl),serverAddress:p.serverAddress})),settings,account:publicAccount(),platform:process.platform,busy,running:Boolean(game),appVersion:app.getVersion(),appUpdate:launcherUpdate?.state()});
  handle('state',publicState);
  handle('select-server',id=>guard(async()=>{Profiles.select(config,id);const next={...settings,selectedServer:id};await atomicJson(path.join(root,'settings.json'),next);settings=next;return publicState();}));
  handle('launcher-check',()=>launcherUpdate.check());
  handle('launcher-download',()=>launcherUpdate.download());
  handle('launcher-install',()=>launcherUpdate.install());
  handle('save', async value => { if (busy || game) throw new Error('Espera a que termine la operación actual.'); if (!Number.isInteger(value?.memory) || value.memory < 2 || value.memory > Math.max(2, Math.min(16, Math.floor(os.totalmem() / 1024 ** 3) - 2))) throw new Error('Cantidad de RAM fuera del rango disponible.'); settings.memory = value.memory; await atomicJson(path.join(root, 'settings.json'), settings); return settings; });
  handle('login', () => guard(async () => { try { return await finishLogin(await authManager().launch('electron', { width: 540, height: 720, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })); } catch { throw new Error('No se completó el acceso Microsoft. Comprueba la conexión, la cuenta y la licencia de Minecraft Java.'); } }));
  handle('logout', () => guard(async () => { account = mc = xbox = null; await fs.rm(path.join(root, 'session.bin'), { force: true }); emit({ type: 'account', account: null }); }));
  handle('update', () => guard(updatePack));
  handle('play', options => guard(() => play(options)));
  handle('choose-java', async () => { if (busy || game) throw new Error('Espera a terminar.'); const r = await dialog.showOpenDialog(win, { title: 'Selecciona java.exe de Java 21 (cancelar = no cambiar)', properties: ['openFile'] }); if (!r.canceled) { settings.javaPath = r.filePaths[0]; await atomicJson(path.join(root, 'settings.json'), settings); } return settings.javaPath; });
  handle('folder', async kind => { const dir = kind === 'game' ? selectedRoot() : root; await fs.mkdir(dir, { recursive: true }); return shell.openPath(dir); });
  launcherUpdate=require('./app-update.cjs').setupAppUpdate({updater:require('electron-updater').autoUpdater,app,channel:config.launcherUpdateUrl||'',emit,blocked:()=>busy||Boolean(game),prepareQuit:()=>{quittingForUpdate=true;}});
  await win.loadFile(path.join(__dirname, '../ui/index.html'));
  if(app.isPackaged&&config.launcherUpdateUrl)setTimeout(()=>{if(!busy&&!game)void launcherUpdate.check().catch(e=>log('Actualizador: '+e.message));},10000);
  if (safeStorage.isEncryptionAvailable()) {
    try { const saved = safeStorage.decryptString(await fs.readFile(path.join(root, 'session.bin'))); await guard(() => finishLoginFromRefresh(saved)); } catch { account = mc = xbox = null; }
  }
}
async function finishLoginFromRefresh(saved) { return finishLogin(await authManager().refresh(saved)); }
if (locked) app.whenReady().then(() => { if (bootError) { dialog.showErrorBox('Configuración inválida', bootError.message); app.quit(); return; } return setup(); }).catch(e => { dialog.showErrorBox('No se pudo abrir el launcher', e.message); app.quit(); });
app.on('window-all-closed', () => { if (!game) app.quit(); });
app.on('before-quit', e => { if (!quittingForUpdate&&(busy || game)) { e.preventDefault(); if (win && !win.isDestroyed()) { win.show(); dialog.showMessageBox(win, { type: 'info', message: 'Cierra Minecraft y espera a que termine la actualización antes de salir.' }); } } });
