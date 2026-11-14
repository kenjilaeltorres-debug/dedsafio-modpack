'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { cleanPath, httpUrl, sha256 } = require('../src/files.cjs');
const { validateManifest, syncPack } = require('../src/updater.cjs');
const { localProfile, redact } = require('../src/auth.cjs');
const { generate } = require('../scripts/create-manifest.cjs');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(__dirname, '.fixture-'));
  const payloads = new Map(); let hits = 0;
  const server = http.createServer((req, res) => { hits++; const b = payloads.get(req.url); if (b === undefined) { res.writeHead(404).end(); return; } res.end(b); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, payloads, hits: () => hits, base: `http://127.0.0.1:${server.address().port}/` };
}
const manifest = files => ({ schema: 1, version: 'test.1', minecraft: '1.21.1', fabricLoader: '0.16.9', files });
function file(base, name, data, mode = 'managed') { return { path: name, url: base + name.split('/').map(encodeURIComponent).join('/'), size: Buffer.byteLength(data), sha256: digest(data), mode }; }
test('offline UUID is deterministic and names are validated', () => {
  assert.equal(localProfile('Notch').uuid, 'b50ad385829d3141a2167e7d7539ba7f');
  assert.equal(localProfile('Jugador').uuid, localProfile('Jugador').uuid);
  assert.notEqual(localProfile('Jugador').uuid, localProfile('jugador').uuid);
  for (const bad of ['a', '../admin', 'con espacios', '<script>', 'abcdefghijklmnopq']) assert.throws(() => localProfile(bad));
});
test('manifest rejects traversal, protected files, devices and case collisions', () => {
  for (const p of ['../options.txt', '/mods/a.jar', 'mods/../a.jar', 'mods/a.jar:evil', 'mods/CON.jar', 'mods/a./b.jar', 'mods/a\\b.jar', 'saves/world/a', 'options.txt']) assert.throws(() => cleanPath(p), p);
  assert.equal(cleanPath('mods/fabric-api+1.21.1.jar'), 'mods/fabric-api+1.21.1.jar');
  assert.throws(() => httpUrl('http://example.com/x')); assert.throws(() => httpUrl('https://a:b@example.com/x'));
  const a = file('https://example.com/', 'mods/a.jar', 'x');
  assert.throws(() => validateManifest(manifest([a, { ...a, path: 'mods/A.jar' }])));
  assert.throws(() => validateManifest(manifest([{ ...a, path: 'config/personal.json' }])));
});
test('installs verified content, skips unchanged downloads and preserves player data', async t => {
  const f = await fixture(t); f.payloads.set('/mods/a.jar', Buffer.from('alpha'));
  await fs.writeFile(path.join(f.dir, 'options.txt'), 'my-controls'); await fs.mkdir(path.join(f.dir, 'saves')); await fs.writeFile(path.join(f.dir, 'saves/world'), 'keep');
  const m = manifest([file(f.base, 'mods/a.jar', 'alpha')]);
  assert.equal((await syncPack(f.dir, m)).updated, 1); const hits = f.hits();
  assert.equal((await syncPack(f.dir, m)).updated, 0); assert.equal(f.hits(), hits);
  assert.equal(await fs.readFile(path.join(f.dir, 'options.txt'), 'utf8'), 'my-controls');
  assert.equal(await fs.readFile(path.join(f.dir, 'saves/world'), 'utf8'), 'keep');
});
test('bad hash leaves old mod intact and releases lock', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'mods')); await fs.writeFile(path.join(f.dir, 'mods/a.jar'), 'old'); f.payloads.set('/mods/a.jar', 'tampered');
  await assert.rejects(syncPack(f.dir, manifest([file(f.base, 'mods/a.jar', 'intended')])));
  assert.equal(await fs.readFile(path.join(f.dir, 'mods/a.jar'), 'utf8'), 'old');
  await assert.rejects(fs.access(path.join(f.dir, '.dedsafio-update.lock')));
});
test('all files verified before commit', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'mods')); await fs.writeFile(path.join(f.dir, 'mods/a.jar'), 'old'); f.payloads.set('/mods/a.jar', 'new'); f.payloads.set('/mods/b.jar', 'invalid');
  await assert.rejects(syncPack(f.dir, manifest([file(f.base, 'mods/a.jar', 'new'), file(f.base, 'mods/b.jar', 'expected')])));
  assert.equal(await fs.readFile(path.join(f.dir, 'mods/a.jar'), 'utf8'), 'old');
  await assert.rejects(fs.access(path.join(f.dir, 'mods/b.jar')));
});
test('retires only previously managed mods and retains backups and custom settings', async t => {
  const f = await fixture(t); f.payloads.set('/mods/a.jar', 'one'); f.payloads.set('/config/mobs.json', 'defaults');
  await syncPack(f.dir, manifest([file(f.base, 'mods/a.jar', 'one'), file(f.base, 'config/mobs.json', 'defaults', 'seed')]));
  await fs.writeFile(path.join(f.dir, 'mods/personal.jar'), 'personal'); await fs.writeFile(path.join(f.dir, 'config/mobs.json'), 'my-edit');
  f.payloads.set('/mods/b.jar', 'two'); const result = await syncPack(f.dir, manifest([file(f.base, 'mods/b.jar', 'two'), file(f.base, 'config/mobs.json', 'new-default', 'seed')]));
  assert.equal(await fs.readFile(path.join(f.dir, 'mods/personal.jar'), 'utf8'), 'personal');
  assert.equal(await fs.readFile(path.join(f.dir, 'config/mobs.json'), 'utf8'), 'my-edit');
  assert.equal(await fs.readFile(path.join(result.backup, 'mods/a.jar'), 'utf8'), 'one');
  await assert.rejects(fs.access(path.join(f.dir, 'mods/a.jar')));
});
test('symlink cannot redirect modpack writes', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t); const elsewhere = path.join(f.dir, 'outside'); await fs.mkdir(elsewhere); await fs.symlink(elsewhere, path.join(f.dir, 'mods')); f.payloads.set('/mods/a.jar', 'x');
  await assert.rejects(syncPack(f.dir, manifest([file(f.base, 'mods/a.jar', 'x')])));
  assert.deepEqual(await fs.readdir(elsewhere), []);
});
test('publisher excludes personal data and produces valid checksums', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'mods')); await fs.writeFile(path.join(f.dir, 'mods/a+1.jar'), 'jar'); await fs.writeFile(path.join(f.dir, 'options.txt'), 'private');
  const m = await generate(f.dir, f.base, '0.1.0'); assert.equal(m.files.length, 1); assert.equal(m.files[0].sha256, await sha256(path.join(f.dir, 'mods/a+1.jar'))); assert.equal(m.files[0].url, f.base + 'mods/a%2B1.jar');
});
test('redacts secrets from log lines', () => {
  const s = redact('--accessToken SECRET access_token=TOKEN refresh_token: REF Bearer ABC.def');
  assert.ok(!s.includes('SECRET') && !s.includes('TOKEN') && !s.includes('REF') && !s.includes('ABC.def'));
});
