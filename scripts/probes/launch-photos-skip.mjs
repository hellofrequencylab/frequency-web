#!/usr/bin/env node
// Launch photos: Add writes to the Space record the item reads, and Skip for now survives a reload without a migration.
// Runs the pure launch state under node, then reads the wiring.
import { readFileSync } from 'node:fs'
import { skipPhoto, stepsWithSkips, toSnapshot } from '../../lib/launch/state.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')

const skipped = skipPhoto([], 'sc-logo')
if (JSON.stringify(skipped) !== '["sc-logo"]') bad.push('skipping a logo is not remembered')
if (skipPhoto([], 'w-site') !== null) bad.push('a non-photo item can be skipped')
const row = { id: 'l1', owner_id: 'p1', started_at: '2026-10-29T12:00:00Z', updated_at: '2026-10-29T12:00:00Z', steps: JSON.parse(JSON.stringify(stepsWithSkips({}, skipped))) }
if (toSnapshot(row)?.skippedPhotos.join() !== 'sc-logo') bad.push('a skipped photo did not survive a reload')
if (toSnapshot({ ...row, steps: { photoSkips: ['sc-cover', 'junk'] } })?.skippedPhotos.join() !== 'sc-cover') bad.push('junk in the skip list is not dropped')

const store = read('lib/launch/store.ts')
if (!/stepsWithSkips\(steps, l\.skippedPhotos\)/.test(store)) bad.push('publishing a step would erase a skip')
const tray = read('components/launch/photo-actions.tsx')
if (!/setSpaceImages\(/.test(tray) || !/uploadSpaceImage\(/.test(tray)) bad.push('Add does not use the Space image seam')
if (!/Skip for now/.test(tray) || /—/.test(tray)) bad.push('Skip for now is missing, or copy has an em dash')
const view = read('components/launch/launch-overview.tsx')
if (!/PhotoActions/.test(view) || /—/.test(view)) bad.push('the overview does not offer Add and Skip, or copy has an em dash')
if (!/skippedPhotos/.test(read('lib/launch/inventory-io.ts'))) bad.push('skipped state does not reach the inventory')

if (bad.length) { console.error(bad.map((b) => `x ${b}`).join('\n')); process.exit(1) }
console.log('ok launch photos: Add uses the Space seam, Skip for now persists in the launch row, no migration')
