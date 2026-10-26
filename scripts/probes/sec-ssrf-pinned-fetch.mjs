import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// SCAN-1123: every server-side fetch of a user-influenced url goes through the pinned fetch.
for (const f of ['lib/og/remote-image.ts', 'lib/ai/web/index.ts', 'lib/importer/harvest/media.ts']) {
  const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
  assert.match(src, /fetchPinned\(/, `${f} must fetch through lib/net/pinned-fetch`)
  const raw = [...src.matchAll(/\bfetch\(([^)]*)\)/g)].filter((m) => !/api\.search\.brave\.com|\bu,/.test(src.slice(m.index - 80, m.index + 80)))
  assert.equal(raw.length, 0, `${f} still calls global fetch on a remote url`)
}
const net = readFileSync('lib/net/pinned-fetch.ts', 'utf8')
assert.match(net, /lookup: pinnedLookup/)
assert.match(net, /isBlockedAddress/)
console.log('Remote image, crawler and importer media fetches are DNS-pinned.')
