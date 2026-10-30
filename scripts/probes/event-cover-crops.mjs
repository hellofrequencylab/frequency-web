// Fails when the event header cover is contained instead of cropped to its focal point.
import { readFileSync } from 'node:fs'
const tsx = readFileSync('components/frequency/members/event/event-header.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/members-b.css', 'utf8')
const ok = /\.fqm-evh-cover-art\{object-fit:cover\}/.test(css) && /eventCoverFocusStyle\(focus\)/.test(tsx)
if (!ok) { console.error('event cover is not cropped by the focal point'); process.exit(1) }
console.log('event cover crops to the focal point')
