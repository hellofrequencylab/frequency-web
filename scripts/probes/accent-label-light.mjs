// LIVE-1780: a solid accent button reads an ink label on a LIGHT accent (white under 2:1), white elsewhere.
import { readFileSync } from 'node:fs'

const src = readFileSync('lib/spaces/accent.ts', 'utf8')
const fails = []
if (!/const WHITE_LABEL_MIN = 2\b/.test(src)) fails.push('readableTextOn: WHITE_LABEL_MIN is not 2 (light accents such as marigold still get white)')
if (!/const FQ_WHITE_MIN = WHITE_LABEL_MIN/.test(src)) fails.push('frequencyAccentVars does not share the WHITE_LABEL_MIN floor')
if (fails.length) {
  console.error(fails.join('\n'))
  process.exit(1)
}
console.log('light accents read ink: ok')
