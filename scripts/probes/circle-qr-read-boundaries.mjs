// Cheap ledger wiring guard. Behavioral consequences live in the four focused regression suites.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(path, 'utf8')
const shell = read('lib/circles/store.ts').split('export const loadCircleShell =')[1]
assert.ok(shell.indexOf('canReadCircleParentSpace(') > 0)
assert.ok(shell.indexOf('canReadCircleParentSpace(') < shell.indexOf(".from('memberships')"))
const parent = read('lib/circles/parent-access.ts')
for (const guard of ["parent.status !== 'active'", "spaceFunctionAvailable(parent, 'circles')", "parent.visibility === 'private' && !caps?.role", 'enabled || caps?.canEditProfile === true']) assert.ok(parent.includes(guard), guard)
assert.ok(!parent.includes('createAdminClient'))
assert.ok(shell.includes("admin.from('spaces')"))
assert.ok(shell.includes('if (error || !parent) return null'))
assert.ok(shell.includes('await getSpaceCapabilities('))
const search = read('app/api/search-scopes/route.ts')
assert.match(search, /supabase\s*\.from\('circles'\)/)
assert.doesNotMatch(search, /admin\s*\.from\('circles'\)/)
const raster = read('lib/qr/raster.ts')
assert.ok(raster.includes('await fetchPinnedLogo(new URL(url))'))
const remote = read('lib/qr/remote-logo.ts')
for (const guard of ["url.protocol !== 'https:'", 'isPrivateIp(a.address)', 'agent: false, lookup: pinnedLookup', 'chosen.address, chosen.family', 'response.statusCode >= 300', 'bytes > MAX_BYTES', 'response.destroy()', '4000']) assert.ok(remote.includes(guard), guard)
assert.ok(!remote.includes('fetch('))
assert.ok(!raster.includes('await res.arrayBuffer()'))
for (const path of ['lib/circles/parent-access.test.ts', 'lib/circles/shell-parent-access.test.ts', 'app/api/search-scopes/route.test.ts', 'lib/qr/raster-security.test.ts']) assert.ok(read(path).includes('expect('))
console.log('Circle parent/session boundaries and bounded redirect-rejecting QR reader remain wired; behavioral suites are separate.')
