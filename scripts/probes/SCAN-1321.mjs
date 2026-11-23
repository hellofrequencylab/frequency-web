#!/usr/bin/env node
// SCAN-1321 (child of SCAN-1133): the Space cancel flows (a booking, an enrollment, a ticket RSVP and
// the member's own bookings list) draw every control with the kit Button. Before, they were hand-rolled:
// a 28px outline for the action and a bare 17px text link for "Keep", beside a membership cancel that
// was already on the kit at 36px. Reads the source, so it fails the moment a raw button comes back.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const files = [
  'components/spaces/booking-cancel-button.tsx',
  'components/spaces/enroll/enrollment-cancel-button.tsx',
  'components/spaces/tickets/ticket-rsvp-cancel-button.tsx',
  'components/spaces/booking-mine-list.tsx',
]
const fails = []
for (const f of files) {
  const src = read(f)
  if (/<button\b/.test(src)) fails.push(`${f}: a raw <button> is back`)
  if (!/from '@\/components\/ui\/button'/.test(src)) fails.push(`${f}: does not import the kit Button`)
  const tags = src.match(/<Button\b(?:[^>=]|=>|=(?!>))*>/g) ?? []
  if (tags.length < 3) fails.push(`${f}: expected the resting, confirm and keep controls on the kit Button, found ${tags.length}`)
  for (const t of tags) {
    if (!/\btype="button"/.test(t)) fails.push(`${f}: a kit Button has no type="button"`)
    if (!/\bsize="sm"/.test(t)) fails.push(`${f}: a kit Button is not the member size (sm, 36px)`)
    if (/\bclassName=/.test(t)) fails.push(`${f}: a kit Button carries a hand-written className`)
  }
  // The destructive step is the danger outline and locks itself while the action is in flight.
  const danger = tags.filter((t) => /variant="dangerOutline"/.test(t))
  if (danger.length !== 1) fails.push(`${f}: expected exactly one danger outline action, found ${danger.length}`)
  else if (!/loading=\{pending\}/.test(danger[0])) fails.push(`${f}: the destructive action does not lock while pending`)
}
const test = 'components/spaces/cancel-controls.render.test.tsx'
if (!existsSync(new URL(`../../${test}`, import.meta.url))) fails.push(`${test} is missing: nothing renders these controls`)
if (fails.length) {
  console.error(`SCAN-1321 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('SCAN-1321 ok: the four Space cancel flows use the kit Button at the member size')
