// BLD-001: the token map. The forty-five contract names (lib/theme/block-contract-tokens.ts) resolve in all three of
// Frequency's rooms, Commons, Commons night and Stage: the contract rides every element that re-declares Frequency's
// aliases, so a Stage section reads Stage values instead of the root's Commons ones. The handoff's --th-* roles point
// at contract names. The pin test resolves every name in each room and compares it with the token it points at there.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const tokens = read('lib/theme/block-contract-tokens.ts')
for (const sel of ['[data-design="frequency"] [data-surface="stage"]', '[data-design="frequency"] [data-time="night"]', '[data-design="frequency"] [data-skin]']) {
  if (!tokens.includes(`'${sel}'`)) bad.push(`the Frequency contract scope lacks ${sel}`)
}
if (!/frequency: FREQUENCY_CONTRACT_SCOPE\.join\(','\)/.test(tokens)) bad.push('the Frequency contract must be declared on every alias element, not the root alone')
if (!/export const TH_TO_CONTRACT/.test(tokens)) bad.push('no --th-* to contract-name map')
for (const [th, c] of [['--th-bg', '--c-canvas'], ['--th-text', '--c-text'], ['--th-muted', '--c-text-muted'], ['--th-accent', '--c-accent'], ['--th-on-accent', '--c-on-accent'], ['--th-r', '--r-card']]) {
  if (!tokens.includes(`'${th}': '${c}'`)) bad.push(`${th} must point at ${c}`)
}
const test = read('lib/theme/block-contract-tokens.test.ts')
if (!/Frequency contract in every room \(BLD-001\)/.test(test)) bad.push('the per-room pin test is missing')
for (const room of ["commons:", "'commons night':", 'stage:']) if (!test.includes(room)) bad.push(`the pin test does not resolve ${room.replace(/[':]/g, '')}`)
if (!/every --th-\* name the handoff or the editor seed uses is mapped/.test(test)) bad.push('the --th-* coverage test is missing')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
