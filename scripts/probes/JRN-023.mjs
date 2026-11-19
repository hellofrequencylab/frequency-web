#!/usr/bin/env node
// JRN-023: the cover focus picker moves the course home's cover. The Manage panel saved
// journey_plans.cover_focus and the sales page read it, but /journeys/<slug>/learn drew its cover
// band with no position, so dragging the focus point changed nothing on the page it was opened from.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const body = readFileSync('components/frequency/members/journey/journey-course-body.tsx', 'utf8')
const page = readFileSync('app/(main)/journeys/[slug]/learn/page.tsx', 'utf8')
assert.ok(/coverFocus=\{plan\.cover_focus/.test(page), 'the course home passes the saved focal point')
assert.ok(/backgroundPosition: coverFocus/.test(body), 'the cover band is positioned by it')
console.log('JRN-023: the course home cover follows the saved focal point')
