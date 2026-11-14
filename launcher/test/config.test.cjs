'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config.cjs');
test('packaged configuration works without the missing internal JSON', () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'config-fixture-'));
  const options = { packaged: true, exePath: path.join(dir, 'Launcher.exe'), developmentPath: path.join(dir, 'missing', 'launcher.config.json') };
  try {
    assert.equal(loadConfig(options).brand, 'MANTIS ESTUDIO');
    fs.writeFileSync(path.join(dir, 'launcher.config.json'), '\uFEFF' + JSON.stringify({ brand: 'Mi servidor', serverAddress: 'localhost:25565' }));
    assert.equal(loadConfig(options).brand, 'Mi servidor');
    assert.equal(loadConfig(options).serverAddress, 'localhost:25565');
    fs.writeFileSync(path.join(dir, 'launcher.config.json'), '{invalid');
    assert.throws(() => loadConfig(options), /JSON válido/);
    fs.writeFileSync(path.join(dir, 'launcher.config.json'), '[]');
    assert.throws(() => loadConfig(options), /objeto JSON/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
