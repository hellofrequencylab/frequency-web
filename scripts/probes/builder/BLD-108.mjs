// BLD-108: shadow render and cutover. Both editors' readings of a document are compared by one pure module over the
// frozen kit corpus (zero or explained delta), unexplained deltas are logged when the new builder opens a real draft,
// and the cutover has a cohort switch (BUILDER_V3_SPACES) between "ask for it" and "everyone", gated in RUNBOOKS.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const shadow = read('lib/builder/shadow.ts')
for (const fn of ['classicView', 'builderView', 'shadowDeltas', 'shadowReport', 'shadowLogLines']) if (!shadow.includes(`export function ${fn}(`)) bad.push(`shadow.ts must export ${fn}`)
if (!/from '@\/components\/page-editor\/mobile\/data-ops'/.test(shadow) || !/from '\.\/spine'/.test(shadow) || !/from '\.\/tune'/.test(shadow)) bad.push('the shadow must read the current editor\'s outline and the builder\'s spine and Tune projection, not a copy')
const test = read('lib/builder/shadow.test.ts')
if (!/KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX/.test(test) || !/expect\(report\.unexplained\)\.toEqual\(\[\]\)/.test(test)) bad.push('the test must prove zero unexplained delta over the kit corpus')
if (!/kind !== 'field'\)\)\.toEqual\(\[\]\)/.test(test)) bad.push('the test must prove sections, names and hidden state agree')
const page = read('components/sites/editor/editor-page.tsx')
if (!/if \(builder === 'v3'\) for \(const line of shadowLogLines\(host, shadowReport\(/.test(page)) bad.push('the editor page must log unexplained deltas when the builder opens a draft')
const state = read('lib/builder/state.ts')
if (!/export function builderV3Cohort\(/.test(state) || !/cohort\.has\(spaceSlug/.test(state)) bad.push('the cutover must have a cohort step')
const route = read('app/hosted/[host]/admin/[view]/page.tsx')
if (!/builderV3Cohort\(envStringOrNull\('BUILDER_V3_SPACES'\)\), space\.slug\)/.test(route)) bad.push('the editor route must read the cohort switch')
if (!/^BUILDER_V3_SPACES=$/m.test(read('.env.example'))) bad.push('.env.example must list BUILDER_V3_SPACES blank')
const runbook = read('docs/RUNBOOKS.md')
if (!/BUILDER_V3_SPACES/.test(runbook) || !/\[builder shadow\]/.test(runbook)) bad.push('RUNBOOKS must gate the cohort on the shadow log')
if (!/classic'\) return false/.test(state)) bad.push('?builder=classic must still force the current editor')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
