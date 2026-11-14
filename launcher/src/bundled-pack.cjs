'use strict';

const path = require('node:path');
const { complement, menu, legacyComplement } = require('./bundled-pack.json');
const previousMenus = ['0.1.0', '0.1.1', '0.1.2', '0.2.0', '0.2.1', '0.2.2']
    .map(version => 'mods/mantis-studio-menu-' + version + '.jar');
const assetBase = 'https://github.com/kenjilaeltorres-debug/dedsafio-modpack/releases/download/v0.1.0/';

function withBundledMods(manifest, directory) {
    const bundled = new Map();
    const complementPath = 'mods/' + complement.name;
    const menuPath = 'mods/' + menu.name;
    const hasCorrected = manifest.files.some(file => file.path === complementPath);
    const obsoleteComplement = file => file.path === legacyComplement.path && file.sha256 === legacyComplement.sha256;
    const files = manifest.files.filter(file => !obsoleteComplement(file) && !previousMenus.includes(file.path));
    if (!hasCorrected && manifest.files.some(obsoleteComplement)) files.push(entry(complement));
    if (!files.some(file => /^mods\/mantis-studio-menu-[^/]+\.jar$/i.test(file.path))) files.push(entry(menu));
    for (const item of [complement, menu]) {
        const key = 'mods/' + item.name;
        if (files.some(file => file.path === key && file.sha256 === item.sha256)) bundled.set(key, path.join(directory, item.name));
    }
    const retired = [...previousMenus];
    if (files.some(file => file.path === complementPath)) retired.push(legacyComplement.path);
    if (!files.some(file => file.path === menuPath)) retired.push(menuPath);
    return { manifest: { ...manifest, files }, options: { bundled, retired } };
}

function entry(item) {
    return { path: 'mods/' + item.name, url: assetBase + item.name,
        sha256: item.sha256, size: item.size, mode: 'managed' };
}

module.exports = { withBundledMods };
