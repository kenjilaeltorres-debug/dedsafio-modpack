const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareRelease } = require('../scripts/create-github-release.cjs');
test('prepares flat release assets and version-pinned URLs without changing original pack', async t => {
  const temp = await fs.mkdtemp(path.join(__dirname, '.github-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const pack = path.join(temp, 'pack'), out = path.join(temp, 'out');
  await fs.mkdir(path.join(pack, 'mods'), { recursive: true }); await fs.mkdir(path.join(pack, 'config'));
  await fs.writeFile(path.join(pack, 'mods/fabric-api+1.21.1.jar'), 'jar'); await fs.writeFile(path.join(pack, 'config/mobs.json'), '{}');
  await fs.writeFile(path.join(pack, 'mods/.temporary'), 'ignore');await fs.writeFile(path.join(pack, 'mods/unfinished.download'), 'ignore');
  const result = await prepareRelease(pack, out, 'v0.1.0');
  assert.equal(result.assets, 3);
  const m = JSON.parse(await fs.readFile(path.join(out, 'manifest.json')));
  assert.equal(m.files.find(f => f.path.startsWith('config/')).mode, 'seed');
  assert.ok(m.files.every(f => f.url.startsWith('https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/download/v0.1.0/')));
  for (const f of m.files) { const asset = decodeURIComponent(new URL(f.url).pathname.split('/').pop()); assert.match(asset,/^[a-z0-9._-]+$/);assert.ok(!(await fs.stat(path.join(out, asset))).isDirectory()); }
  await assert.rejects(fs.access(path.join(pack, 'manifest.json')));
  await assert.rejects(prepareRelease(pack, out, 'v0.1.0'));
  await assert.rejects(prepareRelease(pack, path.join(pack, 'nested'), 'v0.1.0'));
  await assert.rejects(prepareRelease(pack, path.join(temp, 'bad'), '../evil'));
});
