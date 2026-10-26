// Cheap ledger wiring guard. Behavioral consequences live in the four focused regression suites.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(path, 'utf8')
const shell = read('lib/circles/store.ts').split('export const loadCircleShell =')[1]
assert.ok(shell.indexOf('await canReadCircleParentSpace(') > 0)
assert.ok(shell.indexOf('await canReadCircleParentSpace(') < shell.indexOf(".from('memberships')"))
const parent = read('lib/circles/parent-access.ts')
for (const guard of ["data.status !== 'active'", "spaceFunctionAvailable(space, 'circles')", 'await getSpaceCapabilities(space, viewerProfileId)', "data.visibility === 'private' && !caps.role", 'enabled || caps.canEditProfile']) assert.ok(parent.includes(guard), guard)
const search = read('app/api/search-scopes/route.ts')
assert.match(search, /supabase\s*\.from\('circles'\)/)
assert.doesNotMatch(search, /admin\s*\.from\('circles'\)/)
const raster = read('lib/qr/raster.ts')
assert.ok(raster.includes("redirect: 'error'"))
assert.ok(raster.includes('res.body.getReader()'))
assert.ok(raster.includes('if (length > maxBytes)'))
assert.ok(raster.includes('await reader.cancel()'))
assert.ok(!raster.includes('await res.arrayBuffer()'))
for (const path of ['lib/circles/parent-access.test.ts', 'lib/circles/shell-parent-access.test.ts', 'app/api/search-scopes/route.test.ts', 'lib/qr/raster-security.test.ts']) assert.ok(read(path).includes('expect('))
console.log('Circle parent/session boundaries and bounded redirect-rejecting QR reader remain wired; behavioral suites are separate.')
