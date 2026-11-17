#!/usr/bin/env node
// LIVE-2313: the service description field shows how close it is to its cap.
//
// Fails when components/spaces/booking-service-types-form.tsx caps the description with no visible
// "N of 1,000" counter or no plain line once the field is full, or when the client cap drifts from
// the server's slice in lib/spaces/booking.ts.
import { readFileSync } from 'node:fs'

const bad = []
const form = readFileSync('components/spaces/booking-service-types-form.tsx', 'utf8')
const lib = readFileSync('lib/spaces/booking.ts', 'utf8')

const cap = form.match(/const DESCRIPTION_MAX = (\d+)/)?.[1]
if (!cap) bad.push('the form has no DESCRIPTION_MAX constant for the description cap')
if (!form.includes('maxLength={DESCRIPTION_MAX}')) bad.push('the description Textarea is not capped by DESCRIPTION_MAX')
if (!/r\.description\.length\.toLocaleString\('en-US'\)\} of \{DESCRIPTION_MAX\.toLocaleString\('en-US'\)\}/.test(form))
  bad.push('the description has no visible "N of 1,000" counter')
if (!form.includes('Trim a little to keep typing.')) bad.push('no plain line tells the owner the description is full')
if (cap && !lib.includes(`raw.description.trim().slice(0, ${cap})`))
  bad.push(`the client cap (${cap}) does not match the server slice in lib/spaces/booking.ts`)

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('LIVE-2313 ok: service description shows a live counter and a full-field line')
