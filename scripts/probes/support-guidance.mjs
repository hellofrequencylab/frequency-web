#!/usr/bin/env node
// LIVE-2293: the help people read teaches flexible support and actual authorship,
// while preserving each participant's published completion requirements.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const practices = read('content/help/getting-started/practices.md')
assert.match(practices, /more than one/i, 'Practice help must explain overlapping support')
assert.match(practices, /Mind[\s\S]*Body[\s\S]*Spirit[\s\S]*Expression/)
assert.doesNotMatch(practices, /Vera drafts the whole thing|Vera shapes a personal version|make it stick for good/)
assert.match(practices, /author|you write/i, 'The person retains authorship')
const build = read('content/help/sharing/build-a-journey.md')
assert.doesNotMatch(build, /Vera draft a balanced first week|Vera build it|she either pulls[\s\S]{0,100}writes a new one|nudges every side of[\s\S]{0,40}Signature/i)
assert.match(build, /coaching/i)
for (const name of ['your-journey', 'season-ranks', 'season-challenges']) {
  const text = read(`content/help/the-quest/${name}.md`)
  assert.match(text, /The requirements shown for your Journey apply\./, `${name} must retain enrollment-specific requirements`)
  assert.doesNotMatch(text, /Completing the Expression Challenge is (?:\*\*)?required to finish the Journey|cannot\s+close out a Journey without it/i)
  assert.match(text, /\+75 Zaps/, 'Earned completion rewards remain documented')
}
const glossary = read('docs/GLOSSARY.md')
assert.match(glossary, /logged activity, not a measure of wellbeing/i)
assert.match(read('docs/PRACTICE-LIBRARY.md'), /support more than one Pillar/i)
console.log('support guidance: overlapping supports, human authorship, individual requirements and factual graph meaning agree')
