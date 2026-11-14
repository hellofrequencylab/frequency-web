#!/usr/bin/env node
// LIVE-2296: Add/Replace support facets honor the authored associations sent by the server.
import assert from 'node:assert/strict'
import { practiceMatchesSupports } from '../../lib/journeys/practice-support-picker.ts'
const mixed = { pillarId: 'body', supportIds: ['body', 'mind', 'spirit', 'expression'] }
assert.equal(practiceMatchesSupports(mixed, new Set(['mind'])), true)
assert.equal(practiceMatchesSupports(mixed, new Set(['spirit'])), true)
assert.equal(practiceMatchesSupports(mixed, new Set(['expression'])), true)
assert.equal(practiceMatchesSupports(mixed, new Set(['missing'])), false)
assert.equal([mixed].filter(p => practiceMatchesSupports(p, new Set(['mind', 'body']))).length, 1)
assert.equal(practiceMatchesSupports({ pillarId: 'body' }, new Set(['body'])), true)
assert.equal(practiceMatchesSupports({ pillarId: 'body' }, new Set(['mind'])), false)
assert.equal(practiceMatchesSupports({ pillarId: null }, new Set()), true)
assert.equal(practiceMatchesSupports({ pillarId: 'body', supportIds: [] }, new Set(['body'])), false)
console.log('Journey practice support facets include declared secondary/extra areas once and preserve legacy primary-only callers')
