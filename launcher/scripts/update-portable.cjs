'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { NtExecutable, NtExecutableResource, Resource } = require('resedit');

async function build() {
    const asar = await import('@electron/asar');
    const source = path.join(__dirname, '..');
    const root = path.dirname(source);
    const original = path.join(root, 'Actualizar');
    const output = path.join(root, 'Resultado', 'Actualizar');
    const archive = path.join(original, 'resources', 'app.asar');
    const newArchive = path.join(output, 'resources', 'app.asar');
    const stage = path.join(root, 'asar-work');
    fs.mkdirSync(stage);
    fs.mkdirSync(path.dirname(newArchive), { recursive: true });
    asar.extractAll(archive, stage);

    for (const directory of ['src', 'ui']) {
        fs.cpSync(path.join(source, directory), path.join(stage, directory), { recursive: true });
    }
    const packageFile = path.join(stage, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const updated = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    pkg.version = updated.version;
    fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
    await asar.createPackageWithOptions(stage, newArchive, { unpack: '**/background.webm' });

    const hash = file => createHash('sha256').update(asar.getRawHeader(file).headerString).digest('hex');
    const exeName = 'Mantis Studio.exe';
    const exe = NtExecutable.from(fs.readFileSync(path.join(original, exeName)));
    const resources = NtExecutableResource.from(exe);
    const integrity = resources.entries.find(entry => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR');
    assert(integrity);
    const records = JSON.parse(Buffer.from(integrity.bin).toString());
    const appRecord = records.find(record => record.file === 'resources\\app.asar');
    assert.equal(appRecord.alg, 'SHA256');
    assert.equal(appRecord.value, hash(archive));
    appRecord.value = hash(newArchive);
    integrity.bin = Buffer.from(JSON.stringify(records));

    for (const version of Resource.VersionInfo.fromEntries(resources.entries)) {
        version.setFileVersion(updated.version);
        version.setProductVersion(updated.version);
        version.outputToResourceEntries(resources.entries);
    }
    resources.outputResource(exe);
    const newExe = path.join(output, exeName);
    fs.writeFileSync(newExe, Buffer.from(exe.generate()));

    const verified = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(newExe)));
    const check = verified.entries.find(entry => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR');
    assert.deepEqual(JSON.parse(Buffer.from(check.bin).toString()), records);
    assert(Resource.IconGroupEntry.fromEntries(verified.entries).length > 0);
    assert.equal(JSON.parse(asar.extractFile(newArchive, 'package.json')).version, updated.version);
    assert(!asar.extractFile(newArchive, 'src/main.cjs').includes('opts.quickPlay'));
    assert(asar.extractFile(newArchive, 'ui/index.html').includes('Derechos de la animación a Eufonia Studios'));
    const video = 'ui/assets/background.webm';
    assert(asar.statFile(newArchive, video).unpacked);
    assert(asar.extractFile(newArchive, video).equals(fs.readFileSync(path.join(source, video))));
    console.log('Ejecutable, firma de integridad ASAR, icono, video y menú comprobados.');
}

build().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
