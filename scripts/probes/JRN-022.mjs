#!/usr/bin/env node
// JRN-022: the course home shows each week as one card. Checks the consequence in source: a week
// carries its own state node and its focus as facts, a step row leads with its name (the kind moves
// to the line under it), and the hero no longer lowercases the day a week opens.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const body = readFileSync('components/frequency/members/journey/journey-course-body.tsx', 'utf8')
const sheet = readFileSync('app/themes/frequency/members-c.css', 'utf8')
assert.ok(body.includes('className="mc-weeks"') && body.includes('mc-wk-now') && body.includes('mc-wk-locked'), 'each week is a card with its own state')
assert.ok(body.includes('focusFacts(phaseFocusById[p.id])'), "a week's focus reads as facts")
assert.ok(body.includes('splitTitle(l.title'), 'a step row leads with its name')
assert.ok(!body.includes('unlockLine(nextLock.unlockAt).toLowerCase()'), 'the opening day keeps its capitals')
for (const c of ['.mc-weeks', '.mc-wk-h', '.mc-hero-segs']) assert.ok(sheet.includes(c), `${c} is styled`)
console.log('JRN-022: the course home shows each week as a card with its state, its facts and its steps')
