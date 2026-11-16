// PROG-E8B: Vera's questions are measured and the Vera-path tool_use readers go through a schema.
//
// 1. Accept and dismiss are REGISTERED: both names are entries of the event catalog, client-emittable, and the
//    catalog's own name rule holds for them.
// 2. They are FIRST-PARTY ONLY: both names are in the pixel block list, and both mirrors (the browser gtag and the
//    server Measurement Protocol) ask `pixelAllowsEvent` before they send.
// 3. The coach FIRES them: the component sends the registered name for the outcome, with a payload built by the one
//    pure builder, and that builder returns ids and counts only (no label, no wording).
// 4. No hand-written ladder reads a tool_use input on the converted paths: each reader hands the raw input to
//    `validateModelValue` with a zod schema and carries no `typeof` / `as Record<string, unknown>` walk of its own.
// 5. Tests exist for each consequence, and none of them calls a model.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
/** The source of one function, from its declaration to the closing brace at column 0. */
const fnBody = (src, name) => new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`).exec(src)?.[0] ?? ''

const EVENTS = ['editor.vera_question_accepted', 'editor.vera_question_dismissed']

// 1. Registered.
const catalog = read('lib/analytics/events.ts')
for (const name of EVENTS) {
  const entry = new RegExp(`\\{ name: '${name.replace('.', '\\.')}',[^\\n]*clientEmittable: (true|false) \\}`).exec(catalog)
  if (!entry) bad.push(`${name} is not registered in the event catalog`)
  else if (entry[1] !== 'true') bad.push(`${name} must be client-emittable: the coach is a client component`)
  if (!/^[a-z]+\.[a-z_]+$/.test(name)) bad.push(`${name} breaks the catalog's name rule`)
}

// 2. First-party only, enforced at both mirrors.
const sanitize = read('lib/analytics/sanitize.ts')
const blocked = /const FIRST_PARTY_ONLY_EVENTS[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(sanitize)?.[1] ?? ''
for (const name of EVENTS) if (!blocked.includes(`'${name}'`)) bad.push(`${name} is not in the first-party-only set`)
if (!/export function pixelAllowsEvent\(/.test(sanitize)) bad.push('sanitize.ts must export pixelAllowsEvent')
if (!/pixelAllowsEvent\(event\) && browserGoogleAllowed\(\)\) window\.gtag/.test(read('components/analytics/track-provider.tsx'))) bad.push('the browser mirror must ask pixelAllowsEvent before gtag')
if (!/if \(opts\.mirrorGa === false \|\| !pixelAllowsEvent\(event\)\) return recorded/.test(read('lib/analytics/track.ts'))) bad.push('the server mirror must ask pixelAllowsEvent before Google')

// 3. The coach fires them, with ids only.
const coachLib = read('lib/builder/vera-coach.ts')
for (const [outcome, name] of [['accepted', EVENTS[0]], ['dismissed', EVENTS[1]]]) {
  if (!new RegExp(`${outcome}: '${name.replace('.', '\\.')}'`).test(coachLib)) bad.push(`VERA_QUESTION_EVENT.${outcome} must be ${name}`)
}
const props = fnBody(coachLib, 'veraQuestionProps')
if (!props) bad.push('vera-coach.ts must define veraQuestionProps')
if (/\.label|\.question\b|values/.test(props)) bad.push('the telemetry payload must not read a label, a wording or field values')
const coach = read('components/builder/inspector/vera-block-coach.tsx')
if (!/trackClient\(\s*VERA_QUESTION_EVENT\[outcome\],\s*veraQuestionProps\(/.test(coach)) bad.push('the coach must fire the registered event with the pure payload')
for (const outcome of ['accepted', 'dismissed']) if (!new RegExp(`settle\\(q, position, '${outcome}'\\)`).test(coach)) bad.push(`the coach never settles a question as ${outcome}`)
if (/<input|<textarea|onChange=/.test(coach)) bad.push('the coach must stay questions only: no field of its own')

// 4. Schema-read tool_use inputs on the converted paths.
const READERS = [
  ['lib/builder/vera-coach.ts', 'parseBlockCoaching'],
  ['lib/crm/import/ai.ts', 'coerceSuggestions'],
  ['lib/crm/import/ai.ts', 'coerceExtracted'],
  ['lib/importer/reframe/demographic.ts', 'coerceDemographic'],
  ['lib/importer/verify/refute.ts', 'coerceVerdict'],
]
for (const [file, name] of READERS) {
  const src = read(file)
  const body = fnBody(src, name)
  if (!body) { bad.push(`${file} must define ${name}`); continue }
  if (!/validateModelValue\(raw, [A-Za-z_]+\)/.test(body)) bad.push(`${name} must read its input through validateModelValue and a schema`)
  if (/typeof |as Record<string, unknown>|as \{[^}]*\?: unknown/.test(body)) bad.push(`${name} still walks the raw input by hand`)
  if (!/from '@\/lib\/ai\/schema'/.test(src)) bad.push(`${file} must import the shared schema boundary`)
}

// 5. Tests, with every model call mocked.
const tests = [
  ['lib/analytics/client-event-delivery.test.ts', /first-party-only events never reach a pixel/],
  ['lib/analytics/events.test.ts', /keeps every registered editor event off the pixels/],
  ['components/builder/inspector/vera-block-coach.test.tsx', /fires accepted once with ids only/],
  ['components/builder/inspector/vera-block-coach.test.tsx', /fires dismissed once/],
  ['lib/builder/vera-coach.test.ts', /has a closed payload with no wording/],
  ['lib/crm/import/ai.test.ts', /never invents a field/],
]
for (const [file, pattern] of tests) if (!pattern.test(read(file))) bad.push(`${file} is missing the test matching ${pattern}`)
if (!/vi\.mock\('@\/lib\/ai\/complete'/.test(read('lib/crm/import/ai.test.ts'))) bad.push('the CRM import test must mock the model seam')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
