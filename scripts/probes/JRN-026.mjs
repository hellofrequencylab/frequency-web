#!/usr/bin/env node
// JRN-026: the completion moment speaks the Journey's cadence, says what opens next, and its sparks
// burst and clear. Checks the consequence in source: no "Phase complete", the player hands the
// card the cadence and the next week, the certificate carries its day, and a spark's place and its
// pop sit on separate elements (on one, all twelve sat in a dot over the card's words).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const card = readFileSync('components/journey/v2/trophy-celebration.tsx', 'utf8')
const player = readFileSync('components/journey/v2/learn/learn-player.tsx', 'utf8')
const sheet = readFileSync('app/themes/frequency/members-c.css', 'utf8')
assert.ok(!card.includes("'Phase complete'") && !player.includes("'Phase complete'"), 'a finished week is not called a Phase')
assert.ok(card.includes("unit === 'month' ? 'Month' : 'Week'} complete"), 'the card names the cadence')
assert.ok(player.includes('next: after ? phaseHeading(after.title, at + 1, unit) : null'), 'the player hands the card what opens next')
assert.ok(card.includes('Completed on Frequency, {day}'), 'the certificate carries its day')
assert.ok(card.includes('className="mc-spark"') && !/animation: 'cue-pop/.test(card), "a spark's pop no longer replaces its place")
assert.ok(sheet.includes('@keyframes mc-spark') && /prefers-reduced-motion:reduce\)\{[^}]*\.mc-spark\{display:none/.test(sheet), 'sparks fade, and hide when motion is reduced')
console.log('JRN-026: the completion moment names the week, what opens next, and clears its sparks')
