'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const file = path.join(context.appOutDir, 'Mantis Studio.exe');
  fs.rmSync(path.join(context.appOutDir,'code'),{recursive:true,force:true});
  const exe = NtExecutable.from(fs.readFileSync(file), { ignoreCert: true });
  const resource = NtExecutableResource.from(exe);
  const integrity = resource.entries.filter(e => e.type === 'INTEGRITY').map(e => Buffer.from(e.bin));
  const icon = Data.IconFile.from(fs.readFileSync(path.join(__dirname, '../ui/assets/mantis.ico')));
  const groups = Resource.IconGroupEntry.fromEntries(resource.entries);
  for (const group of groups) Resource.IconGroupEntry.replaceIconsForResource(resource.entries, group.id, group.lang, icon.icons.map(i => i.data));
  if (!groups.length) Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, icon.icons.map(i => i.data));
  const version = context.packager.appInfo.version;
  for (const info of Resource.VersionInfo.fromEntries(resource.entries)) {
    info.setFileVersion(version); info.setProductVersion(version);
    for (const language of info.getAllLanguagesForStringValues()) info.setStringValues(language, {
      ProductName: 'Mantis Studio', FileDescription: 'Mantis Studio',
      CompanyName: 'Mantis Studio', InternalName: 'Mantis Studio', OriginalFilename: 'Mantis Studio.exe'
    });
    info.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(exe);
  fs.writeFileSync(file, Buffer.from(exe.generate()));
  const check = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(file)));
  const after = check.entries.filter(e => e.type === 'INTEGRITY').map(e => Buffer.from(e.bin));
  assert.deepEqual(after, integrity, 'ASAR integrity must be preserved');
  assert(Resource.IconGroupEntry.fromEntries(check.entries).length > 0);
};
