#!/usr/bin/env node
// LIVE-2287: support choices stay plural and coaching permits rest without changing reward rules.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PRACTICE_SUPPORT_COPY, PRACTICE_SUPPORT_GUIDANCE, VERA_PRACTICE_SUPPORT_GUIDANCE } = await import('../../lib/practices/support-language.ts')
const { TERM_PRESETS, DEFAULT_TERM_WEEKS, ACTIVE_PRACTICE_CAP } = await import('../../lib/practices/adoption.ts')
const { withPracticeShape } = await import('../../lib/ai/practice-shape.ts')
assert.equal(PRACTICE_SUPPORT_COPY.heading, 'What can this support?')
assert.match(PRACTICE_SUPPORT_COPY.hint, /Choose any that fit/)
assert.match(PRACTICE_SUPPORT_GUIDANCE, /several/)
assert.match(VERA_PRACTICE_SUPPORT_GUIDANCE, /Rest/)
assert.match(VERA_PRACTICE_SUPPORT_GUIDANCE, /private/)
assert.match(VERA_PRACTICE_SUPPORT_GUIDANCE, /Never infer/)
assert.ok(withPracticeShape('Author instructions remain authoritative.').includes(PRACTICE_SUPPORT_GUIDANCE))
assert.ok(withPracticeShape('Author instructions remain authoritative.').endsWith('Author instructions remain authoritative.'))
assert.doesNotMatch(withPracticeShape('Author instructions remain authoritative.'), /belongs to one of four Pillars/)
assert.deepEqual(TERM_PRESETS.map(p => p.weeks), [2, 4, 8, null])
assert.equal(DEFAULT_TERM_WEEKS, 4)
assert.equal(ACTIVE_PRACTICE_CAP, 5)
assert.doesNotMatch(TERM_PRESETS[2].hint, /for good|guarantee|permanent/i)
const builder = readFileSync('components/studio/practice/practice-builder.tsx', 'utf8')
assert.ok(builder.includes('{PRACTICE_SUPPORT_COPY.heading}'))
assert.ok(builder.includes('onClick={() => toggleFocus(p.id)}'))
const vera = readFileSync('lib/ai/vera/agent-claude.ts', 'utf8')
assert.ok(vera.includes('${VERA_PRACTICE_SUPPORT_GUIDANCE}'))
assert.ok(!vera.includes('Then nudge, always,'))
console.log('Practice support language: plural choices, optional expression and rest, honest terms, unchanged commitment limits')
