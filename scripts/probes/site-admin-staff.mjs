// LIVE-921: the website's admin gate agrees with the console's on platform staff. The console handoff
// (app/(main)/spaces/[slug]/manage/leadership/open) mints a full pass to anyone getSpaceCapabilities lets
// edit, which includes platform staff on any Space; the site gate (lib/sites/site-admin.ts) must accept the
// same people, or a staff member who is not on the team loops between the two until the browser gives up.
// Run: node scripts/probes/site-admin-staff.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gate = readFileSync('lib/sites/site-admin.ts', 'utf8')
const body = gate.slice(gate.indexOf('export async function siteAdminAllowed'), gate.indexOf('async function readProfileWebRole'))
assert.match(body, /return isStaff\(await readProfileWebRole\(pass\.profileId\)\)/, 'the site gate admits platform staff')
assert.match(readFileSync('lib/spaces/entitlements.ts', 'utf8'), /staff \? STAFF_CAPABILITIES : NO_CAPABILITIES/, 'the console still grants staff full capabilities')
assert.match(readFileSync('lib/sites/site-admin.test.ts', 'utf8'), /lets platform staff in who are not on the team/, 'the regression test stands')
console.log('site-admin-staff: ok')
