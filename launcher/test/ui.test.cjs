'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');
test('UI switches profiles and panels, persists RAM', async () => {
  const { window, document } = parseHTML(fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8'));
  let listener, saved, played;
  window.launcher = {
    state: async () => ({ config: { news: [{ tag: 'TEST', title: '<script>bad()</script>', body: 'texto seguro' }], allowLocalProfiles: true, configured: true, microsoftConfigured: false }, settings: { memory: 6, localName: 'Jugador' }, busy: false, running: false, account: null }),
    onEvent: fn => { listener = fn; },
    save: async value => { saved = value; return value; },
    play: async value => { played = value; },
    login: async () => ({ name: 'Premium', uuid: '123' }), logout: async () => {},
    update: async () => {}, chooseJava: async () => '', folder: async () => ''
  };
  new Function('window', 'document', fs.readFileSync(path.join(__dirname, '../ui/renderer.js'), 'utf8'))(window, document);
  await new Promise(setImmediate);
  assert.ok(document.getElementById('localFields').classList.contains('hidden'));
  await document.getElementById('login').onclick();
  assert.match(document.getElementById('noticeText').textContent, /microsoftClientId/);
  assert.ok(!document.getElementById('notice').classList.contains('hidden'));
  document.getElementById('localMode').onclick();
  assert.ok(!document.getElementById('localFields').classList.contains('hidden'));
  assert.equal(document.getElementById('localName').value, 'Jugador');
  await document.getElementById('play').onclick(); assert.deepEqual(played, { mode: 'local', name: 'Jugador' });
  document.querySelector('.nav[data-panel="settings"]').click(); assert.ok(!document.getElementById('settings').classList.contains('hidden'));
  document.getElementById('memory').value = '8'; document.getElementById('memory').oninput(); await document.getElementById('saveSettings').onclick();
  assert.deepEqual(saved, { memory: 8 }); assert.equal(document.getElementById('memoryLabel').textContent, '8 GB');
  listener({ type: 'busy', busy: true }); assert.equal(document.getElementById('play').disabled, true);
  listener({ type: 'busy', busy: false }); assert.equal(document.getElementById('play').disabled, false);
  listener({ type: 'game', running: true }); assert.equal(document.getElementById('update').disabled, true);
  listener({ type: 'game', running: false }); listener({ type: 'progress', phase: 'ready', version: '0.1.0' }); assert.equal(document.getElementById('progress').value, 100);
  listener({ type: 'log', message: 'mensaje de prueba' }); assert.match(document.getElementById('logOutput').textContent, /mensaje de prueba/);
});
test('configured Microsoft login calls the bridge and displays the connected account', async () => {
  const { window, document } = parseHTML(fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8'));
  let calls = 0;
  window.launcher = {
    state: async () => ({ config: { microsoftConfigured: true, allowLocalProfiles: true }, settings: { memory: 6 }, account: null }),
    onEvent: () => {}, login: async () => { calls++; return { name: 'JugadorPremium' }; }
  };
  new Function('window', 'document', fs.readFileSync(path.join(__dirname, '../ui/renderer.js'), 'utf8'))(window, document);
  await new Promise(setImmediate);
  await document.getElementById('login').onclick();
  assert.equal(calls, 1);
  assert.equal(document.getElementById('profileName').textContent, 'JugadorPremium');
  assert.ok(document.getElementById('notice').classList.contains('hidden'));
  assert.ok(!document.getElementById('logout').classList.contains('hidden'));
});
test('server tabs persist selection through IPC, change visual identity and block selection in game',async()=>{const {window,document}=parseHTML(fs.readFileSync(path.join(__dirname,'../ui/index.html'),'utf8'));let listener,calls=[];const data={config:{configured:true,allowLocalProfiles:true},profiles:[{id:'dedsafio',minecraft:'1.21.1',subtitle:'Dedsafío'},{id:'smp',minecraft:'1.20.1',subtitle:'Mantis SMP'}],settings:{selectedServer:'dedsafio',memory:6},appUpdate:{status:'idle'},appVersion:'0.2.0'};window.launcher={state:async()=>data,onEvent:fn=>listener=fn,selectServer:async id=>{calls.push(id);return {...data,config:{...data.config,configured:id!=='smp'},settings:{...data.settings,selectedServer:id}};}};new Function('window','document',fs.readFileSync(path.join(__dirname,'../ui/renderer.js'),'utf8'))(window,document);await new Promise(setImmediate);assert.equal(document.body.dataset.server,'dedsafio');await document.getElementById('serverSmp').onclick();assert.deepEqual(calls,['smp']);assert.equal(document.body.dataset.server,'smp');assert.match(document.getElementById('versionLabel').textContent,/1.20.1/);assert.equal(document.getElementById('play').disabled,true);listener({type:'game',running:true});await document.getElementById('serverDedsafio').onclick();assert.equal(calls.length,1);listener({type:'game',running:false});await document.getElementById('serverDedsafio').onclick();assert.equal(document.getElementById('play').disabled,false);listener({type:'app-update',status:'ready',nextVersion:'0.2.1'});assert.equal(document.getElementById('installLauncher').classList.contains('hidden'),false);});
