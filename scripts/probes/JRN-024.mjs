#!/usr/bin/env node
// JRN-024: the Library speaks the Journey's own cadence and shows it week by week. Checks the
// consequence in source: no card says "Phase n of m", the progress reader carries the cadence word,
// the cover's focal point and each week's completion, and the page draws them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const page = readFileSync('app/(main)/journeys/library/page.tsx', 'utf8')
const reader = readFileSync('lib/journeys/progress.ts', 'utf8')
assert.ok(!page.includes('`Phase ${'), 'no card calls a week a Phase')
for (const f of ['unit: cadenceUnit(', 'coverFocus:', 'phasePercents:', 'lessonsLeft:']) assert.ok(reader.includes(f), `the progress reader carries ${f}`)
assert.ok(reader.includes('cover_focus, drip_interval_days'), 'the reader selects the focal point and the cadence')
assert.ok(page.includes('objectPosition: j.coverFocus') && page.includes('objectPosition: resume.coverFocus'), 'covers crop from the saved focal point')
assert.ok(page.includes('className="mc-segs"') && page.includes('j.phasePercents.map('), 'progress shows week by week')
assert.ok(page.includes('splitTitle(title)'), "the next step's kind is set apart from its name")
console.log('JRN-024: the Library shows each Journey week by week, in its own cadence, cropped where the owner set')
