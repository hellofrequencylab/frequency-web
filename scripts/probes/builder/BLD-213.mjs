// BLD-213: every role that reads the Space's rows (role.json `live: true`) has a live reader in roleHasSpaceRows, so a live
// page draws the Space's own rows and nothing of the sample when the Space has none; the Booking role draws the Space's
// open slots from content-data's booking openings; and the live-rows test covers each reader with a fixture Space.
import fs from 'node:fs'
import path from 'node:path'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const roles = read('components/page-editor/blocks/roles.tsx')
const test = read('components/page-editor/blocks/roles.test.tsx')
const dir = 'lib/blocks/roles'
const live = fs.readdirSync(dir).filter((f) => f.endsWith('.role.json')).map((f) => ({ id: path.basename(f, '.role.json'), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })).filter((r) => r.live === true)
if (live.length < 8) bad.push(`only ${live.length} live roles declared; the audit names at least eight`)
const cases = roles.match(/export function roleHasSpaceRows[\s\S]*?\n}/)?.[0] ?? ''
for (const { id } of live) {
  if (!cases.includes(`case '${id}'`)) bad.push(`${id} is live but roleHasSpaceRows has no reader for it`)
  if (!test.includes(`'${id}'`)) bad.push(`${id} is live but the live-rows test never names it`)
}
if (!/function liveBooking\(/.test(roles) || !/openings/.test(roles)) bad.push('the Booking role must draw the Space\'s open slots')
if (!/openings\?: SpaceBookingOpening\[\]/.test(read('lib/spaces/content-data.ts'))) bad.push('content-data must carry the booking openings')
if (!/'booking', 'Thu, Nov 12'/.test(test)) bad.push('the live-rows test must prove Booking draws a real opening')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
