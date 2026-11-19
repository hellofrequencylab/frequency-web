#!/usr/bin/env node
// JRN-025: the Journey About page reads like the course it sells. Checks the consequence in source:
// weeks are cards in the Journey's own cadence (never "Phase n"), a step leads with its name, the
// head totals the time, and a visitor is not shown an empty progress ring.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const body = readFileSync('components/frequency/members/journey/journey-body.tsx', 'utf8')
const page = readFileSync('app/(main)/journeys/[slug]/page.tsx', 'utf8')
assert.ok(!body.includes('`Phase ${'), 'no week is called a Phase')
assert.ok(body.includes('className="mc-weeks"') && body.includes('phaseHeading(phase.title, i, unit)'), 'each week is a card named in the cadence')
assert.ok(body.includes('splitTitle(lesson.title'), 'a step leads with its name')
assert.ok(body.includes('timeLine(totalMinutes)'), 'the head totals the time')
assert.ok(/\{tracked && \(\s*<div\s+className="mc-ring"/.test(body), 'the ring shows only for tracked progress')
assert.ok(page.includes('unit={cadenceUnit('), 'the page hands the body the cadence')
console.log('JRN-025: the About page shows the course week by week, with its time, and no empty ring for a visitor')
