// Exercise the real Expo -> config-plugins -> xcode dependency, not a separate UUID fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const expoRequire = createRequire(require.resolve('expo/package.json'));
const pluginsRequire = createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const xcode = pluginsRequire('xcode');
const xcodeRequire = createRequire(pluginsRequire.resolve('xcode'));
const uuid = xcodeRequire('uuid');

test('Expo xcode resolves the reviewed UUID patch and rejects partial output writes', () => {
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
  for (const fn of [uuid.v3, uuid.v5]) {
    const buffer = new Uint8Array(8).fill(170);
    assert.throws(() => fn('fixture', uuid.v5.DNS, buffer, 4), RangeError);
    assert.deepEqual([...buffer], Array(8).fill(170));
  }
});

test('xcode generates identifiers and round-trips a synthetic group and file with the patched UUID', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'frequency-xcode-uuid-'));
  try {
    const file = path.join(dir, 'project.pbxproj');
    const project = xcode.project(file);
    project.hash = { project: { archiveVersion: 1, classes: {}, objectVersion: 56,
      objects: { PBXBuildFile: {}, PBXFileReference: {}, PBXGroup: {}, PBXProject: {} },
      rootObject: '000000000000000000000001' } };
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = project.generateUuid();
      assert.match(id, /^[A-F0-9]{24}$/);
      assert.equal(ids.has(id), false);
      ids.add(id);
    }
    const group = project.addPbxGroup(['Fixture.swift'], 'Fixture', 'Fixture');
    writeFileSync(file, project.writeSync());
    const parsed = xcode.project(file).parseSync();
    const actualGroup = parsed.hash.project.objects.PBXGroup[group.uuid];
    assert.equal(actualGroup.name, 'Fixture');
    assert.ok(parsed.hash.project.objects.PBXFileReference[actualGroup.children[0].value]);
    writeFileSync(file, parsed.writeSync());
    assert.deepEqual(xcode.project(file).parseSync().hash, parsed.hash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
