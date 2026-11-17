// PROG-E8C: the seven tool_use readers PROG-E8B left on hand-written ladders now read through a schema.
//
// Run with the repo's resolver hook so the REAL modules load (scripts/probe-ts.mjs, LIVE-475):
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/builder/PROG-E8C.mjs
//
// 1. EXECUTED: the shared blocks the readers are built from (lib/ai/schema.ts) are loaded and driven with malformed
//    values. Each one falls to its safe reading and none throws.
// 2. EXECUTED: the four readers that are pure modules are run on a valid reply and on malformed ones: the launch
//    polish (lib/launch/buildout.ts), the event scan (lib/events/normalize.ts), the card scan
//    (lib/connections/extraction.ts) and the importer extract (lib/importer/extract/reply.ts, then the grounding
//    coercer it feeds). Valid gives the stored shape; malformed gives each reader's safe fallback; none throws. The
//    importer case is the one that threw on main: a number where a cited value belongs.
// 3. READ: each of the seven readers hands the raw tool input to `validateModelValue` with a zod schema, and no
//    hand-written `typeof x.y === ...` test or `as Record<string, unknown>` cast over that input is left in it. The
//    other three (WhatsApp, image plan, listing seeder) sit in modules that import the model client, so they are
//    read here and executed by their unit tests.
// 4. READ: the card reader moved beside the browser helpers instead of into them, so no client component pulls the
//    schema library in through lib/connections/normalize.ts.
// 5. Tests exist for a valid and a malformed reply per reader, and the ones that go through a call mock the model.
import fs from 'node:fs'

const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
/** The source of one function, from its declaration to the closing brace at column 0. */
const fnBody = (src, name) => new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`).exec(src)?.[0] ?? ''
/** A hand-written read of an untyped value: a runtime `typeof x ===` test, or a cast that invents a shape. Type-level
 *  `typeof` (z.infer<typeof X>, keyof typeof X, (typeof X)[number]) is not one. */
const ladder = (src) =>
  /typeof [\w.?[\]]+ [!=]==|as Record<string, unknown>|as \{[^}]*\?: unknown|as RawExtraction\b|as RawExtractedField\b|as (Classifieds|Housing)Extraction\b/.exec(
    src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, ''),
  )?.[0]
const safely = (label, fn) => {
  try {
    return fn()
  } catch (err) {
    bad.push(`${label} threw: ${err?.message ?? err}`)
    return undefined
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const JUNK = [undefined, null, 0, 7, '', 'nope', true, [], [null, 3, 'x'], {}]

// 1. The shared blocks, executed.
const schema = await import(new URL('../../../lib/ai/schema.ts', import.meta.url)).catch((err) => (bad.push(`lib/ai/schema.ts does not load: ${err.message}`), {}))
const { z, validateModelValue, unitBox, citedField, looseEnum, looseNumber, aliasedText, rowsOrNone } = schema
if (!unitBox || !citedField || !looseEnum || !looseNumber || !aliasedText || !rowsOrNone) {
  bad.push('lib/ai/schema.ts must export the extractor blocks: unitBox, citedField, looseEnum, looseNumber, aliasedText, rowsOrNone')
} else {
  for (const junk of JUNK) {
    if (safely('unitBox', () => unitBox.parse(junk)) !== null) bad.push(`unitBox must read ${JSON.stringify(junk)} as null`)
    const cited = safely('citedField', () => citedField.parse(junk))
    if (cited !== undefined && !same(cited, {})) bad.push(`citedField must read ${JSON.stringify(junk)} as absent`)
    if (!same(safely('rowsOrNone', () => rowsOrNone(z.object({ id: z.string() })).parse(junk)), [])) bad.push(`rowsOrNone must read ${JSON.stringify(junk)} as no rows`)
    if (safely('looseEnum', () => looseEnum(['logo', 'photo']).catch('photo').parse(junk)) !== 'photo') bad.push(`looseEnum must reject ${JSON.stringify(junk)}`)
  }
  if (!same(safely('unitBox', () => unitBox.parse({ x: -1, y: '0.5', w: 3, h: 0.9 })), { x: 0, y: 0.5, w: 1, h: 0.5 })) bad.push('unitBox must clamp a box into the unit square')
  if (!same(safely('citedField', () => citedField.parse({ value: 7, snippet: 9, kind: 'fact', confidence: 'x' })), { kind: 'fact' })) bad.push('citedField must read a wrong-typed part as absent and keep the rest')
  if (safely('looseEnum', () => looseEnum(['logo', 'photo']).parse(' Logo ')) !== 'logo') bad.push('looseEnum must ignore case and space')
  if (safely('looseNumber', () => looseNumber.parse('0.25')) !== 0.25 || looseNumber.safeParse('a quarter').success || looseNumber.safeParse(Number.POSITIVE_INFINITY).success) bad.push('looseNumber must take a numeric string and refuse what is not finite')
  const aliased = z.object({ a: aliasedText(9), b: aliasedText(9) })
  const pick = (v) => safely('aliasedText', () => ((r) => r.a ?? r.b ?? '')(aliased.parse(v)))
  if (pick({ b: 'old' }) !== 'old' || pick({ a: 7, b: 'old' }) !== '' || pick({}) !== '') bad.push('aliasedText must let an absent key fall to its alias and read a wrong type as empty')
  if (validateModelValue('x', z.object({})).ok !== false) bad.push('validateModelValue must refuse a reply that is not the declared shape')
}

// 2. The launch polish reader, executed.
const buildout = await import(new URL('../../../lib/launch/buildout.ts', import.meta.url)).catch((err) => (bad.push(`lib/launch/buildout.ts does not load: ${err.message}`), {}))
if (buildout.applyPolish) {
  const input = {
    spotlight: { name: 'Mara Quinn', line: 'I teach breathwork to tired founders in Austin.', link: 'https://maraquinn.com/' },
    space: { tagline: 'Breathwork for tired founders', about: 'Mara runs small evening sessions at a studio in East Austin.' },
    profile: { bio: 'Former product manager turned breathwork guide.', website: 'maraquinn.com' },
    facts: [],
  }
  const passages = buildout.passagesOf(input)
  const base = buildout.quoteDraft(input)
  const good = { slot: 'space', field: 'tagline', value: 'Breathwork, for tired founders', snippet: 'Breathwork for tired founders', origin: 'Your Space tagline' }
  const polished = safely('applyPolish on a valid reply', () => buildout.applyPolish(base, { fields: [good] }, passages))
  if (polished?.space.tagline !== 'Breathwork, for tired founders') bad.push('applyPolish must still apply a valid, cited rewrite')
  const malformed = [...JUNK, { fields: 'tagline' }, { fields: { 0: good } }, { fields: [null, 4, 'x', [], { ...good, value: 12 }, { ...good, snippet: null }] }, { fields: [{ ...good, origin: ['x'] }, { ...good, slot: 3 }, { slot: 'space' }] }]
  for (const reply of malformed) {
    const out = safely(`applyPolish on ${JSON.stringify(reply)}`, () => buildout.applyPolish(base, reply, passages))
    if (out !== undefined && !same(out, base)) bad.push(`applyPolish must leave the draft unchanged on the malformed reply ${JSON.stringify(reply)}`)
  }
  const mixed = safely('applyPolish on a mixed reply', () => buildout.applyPolish(base, { fields: [null, { ...good, value: 12 }, good] }, passages))
  if (mixed?.space.tagline !== 'Breathwork, for tired founders') bad.push('applyPolish must drop a malformed rewrite and keep the good one beside it')
}

// 2b. The event scan, the card scan and the importer extract, executed.
const load = (file) => import(new URL(`../../../${file}`, import.meta.url)).catch((err) => (bad.push(`${file} does not load: ${String(err.message).split('\n')[0]}`), {}))
const events = await load('lib/events/normalize.ts')
if (events.coerceEventExtraction && events.coerceEventDetails) {
  const empty = safely('coerceEventExtraction on {}', () => events.coerceEventExtraction({}))
  for (const junk of JUNK) {
    if (!same(safely('coerceEventExtraction', () => events.coerceEventExtraction(junk)), empty)) bad.push(`coerceEventExtraction must read ${JSON.stringify(junk)} as an empty event`)
    if (!same(safely('coerceEventDetails', () => events.coerceEventDetails(junk)), {})) bad.push(`coerceEventDetails must read ${JSON.stringify(junk)} as {}`)
  }
  const ev = safely('coerceEventExtraction on a valid reply', () => events.coerceEventExtraction({ title: ' Sound Bath ', startsAt: '2027-03-01T19:00:00Z', priceCents: '1500', domain: ' Body ', tags: ['#Sound', 'sound'], cover: { box: { x: 0.1, y: '0.2', w: 0.5, h: 0.4 }, imageIndex: 1.7 }, details: { lineup: [{ name: 'DJ A', role: 'DJ' }, null, { role: 'band' }], links: [{ url: 'javascript:alert(1)' }, { url: 'example.com/t' }] } }))
  if (!same(ev && [ev.title, ev.startsAt, ev.priceCents, ev.domain, ev.tags, ev.cover, ev.details], ['Sound Bath', '2027-03-01T19:00:00.000Z', 1500, 'body', ['sound'], { found: true, box: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, imageIndex: 1 }, { lineup: [{ name: 'DJ A', role: 'dj' }], links: [{ label: 'https://example.com/t', url: 'https://example.com/t', kind: 'other' }] }])) bad.push('coerceEventExtraction must read a valid reply into the stored shape')
  const mixed = safely('coerceEventExtraction on wrong types', () => events.coerceEventExtraction({ title: 'Open Mic', description: 7, startsAt: 12, isFree: 'yes', priceCents: -5, domain: 'sports', tags: 'music', cover: 'top', corners: [{ x: 2, y: 0 }], quality: 9, details: 'lots' }))
  if (!same(mixed, { ...empty, title: 'Open Mic' })) bad.push('coerceEventExtraction must let each wrong-typed field fall to its own safe reading and keep the rest')
}
const cards = await load('lib/connections/extraction.ts')
if (cards.coerceExtraction && cards.coerceContactDetails) {
  const empty = safely('coerceExtraction on {}', () => cards.coerceExtraction({}))
  for (const junk of JUNK) {
    if (!same(safely('coerceExtraction', () => cards.coerceExtraction(junk)), empty)) bad.push(`the card reader must read ${JSON.stringify(junk)} as an empty contact`)
    if (!same(safely('coerceContactDetails', () => cards.coerceContactDetails(junk)), {})) bad.push(`coerceContactDetails must read ${JSON.stringify(junk)} as {}`)
  }
  const c = safely('the card reader on a valid reply', () => cards.coerceExtraction({ displayName: ' Sam Lee ', email: ' SAM@X.COM ', socials: { twitter: '@samx' }, tags: ['#Yoga', 'yoga', 4], note: 'met at expo', details: { phones: [{ phone: '777' }, 'x'], links: [{ url: 'a.test', kind: 'Booking' }] } }))
  if (!same(c && [c.displayName, c.email, c.socials, c.tags, c.connectionNote, c.details], ['Sam Lee', 'sam@x.com', { x: '@samx' }, ['Yoga'], 'met at expo', { phones: [{ label: '', number: '777' }], links: [{ label: 'a.test', url: 'a.test', kind: 'booking' }] }])) bad.push('the card reader must read a valid reply into the stored shape')
  const mixed = safely('the card reader on wrong types', () => cards.coerceExtraction({ displayName: 7, name: 'Alt', email: ['a@b.c'], company: 'Acme', socials: 'instagram', tags: 'yoga', photo: 3, corners: {}, quality: [], details: [1] }))
  if (!same(mixed, { ...empty, company: 'Acme' })) bad.push('the card reader must let each wrong-typed field fall to its own safe reading and keep the rest')
}
const reply = await load('lib/importer/extract/reply.ts')
const grounding = await load('lib/importer/extract/coerce.ts')
if (reply.readRawExtraction && grounding.coerceExtraction) {
  for (const junk of JUNK.filter((j) => !same(j, {}))) if (safely('readRawExtraction', () => reply.readRawExtraction(junk)) !== null) bad.push(`readRawExtraction must read ${JSON.stringify(junk)} as null`)
  const sources = [{ id: 's1', kind: 'page', url: 'https://acme.test/', fetchedAt: 'now', text: 'Acme Coffee is at 123 Main St. Call 555-1212.' }]
  const cited = (value) => ({ value, snippet: value, sourceUrl: 'https://acme.test/', kind: 'fact', confidence: 0.9 })
  const extract = (input) => safely(`the importer extract on ${JSON.stringify(input).slice(0, 80)}`, () => grounding.coerceExtraction(reply.readRawExtraction(input), sources, 'Hint'))
  const good = extract({ name: cited('Acme Coffee'), contact: { phone: cited('555-1212') } })
  if (!same(good?.draft, { name: 'Acme Coffee', type: 'business', contact: { phone: '555-1212' } }) || good?.ledger['contact.phone']?.[0].kind !== 'fact') bad.push('the importer extract must still ground a valid reply')
  // On main each of these reached a .trim() on a non-string and threw, losing the whole extraction.
  const hurt = extract({ name: cited('Acme Coffee'), brandName: { value: 42 }, contact: { phone: { value: 5551212, snippet: 3 }, socials: [null, { platform: 7, url: 'u' }] }, offerings: [null, { title: { value: 9 } }], faq: 'none', events: [7] })
  if (!same(hurt?.draft, { name: 'Acme Coffee', type: 'business' })) bad.push('the importer extract must read a wrong-typed part as absent and keep the rest')
}

// 3. Each reader goes through the schema helper, and no ladder over the tool input is left in it.
const SCHEMA_IMPORT = /from '(@\/lib\/ai\/schema|\.\.\/ai\/schema\.ts)'/
/** [file, reader function, the schema read it must make, how much of the file must be ladder-free] */
const READERS = [
  ['lib/whatsapp/extract.ts', 'readItems', /validateModelValue\(raw, ITEMS_REPLY\)/, 'file'],
  ['lib/importer/extract/reply.ts', 'readRawExtraction', /validateModelValue\(raw, EXTRACTION_REPLY\)/, 'file'],
  ['lib/listing-seeder/extract.ts', 'readListingReply', /validateModelValue\(raw, CLASSIFIEDS_REPLY\)[\s\S]*validateModelValue\(raw, HOUSING_REPLY\)/, 'file'],
  ['lib/launch/buildout.ts', 'applyPolish', /validateModelValue\(raw, POLISH_REPLY\)/, 'fn'],
  ['lib/connections/extraction.ts', 'coerceExtraction', /validateModelValue\(raw, CONTACT_REPLY\)/, 'file'],
  ['lib/connections/extraction.ts', 'coerceContactDetails', /validateModelValue\(raw, CONTACT_DETAILS\)/, 'file'],
  ['lib/events/normalize.ts', 'coerceEventExtraction', /validateModelValue\(raw, EVENT_REPLY\)/, 'file'],
  ['lib/events/normalize.ts', 'coerceEventDetails', /validateModelValue\(raw, EVENT_DETAILS\)/, 'file'],
]
for (const [file, name, schemaRead, scope] of READERS) {
  const src = read(file)
  const body = fnBody(src, name)
  if (!body) { bad.push(`${file} must define ${name}`); continue }
  if (!schemaRead.test(body)) bad.push(`${name} (${file}) must read its input through validateModelValue and a schema`)
  if (!SCHEMA_IMPORT.test(src)) bad.push(`${file} must import the shared schema boundary`)
  const left = ladder(scope === 'file' ? src : body)
  if (left) bad.push(`${name} (${file}) still walks the raw input by hand: ${left}`)
}

// The two readers that sit inside a call path: the cast is gone and the schema read is what the call uses.
const run = read('lib/importer/extract/run.ts')
if (!/readRawExtraction\(block\.input\)/.test(run)) bad.push('the importer extract call must read the tool input through readRawExtraction')
if (ladder(fnBody(run, 'extractProfile')) || /block\.input as /.test(run)) bad.push('the importer extract call still casts the tool input')
const vision = read('lib/importer/vision.ts')
const planBody = fnBody(vision, 'planSeedImages')
if (!/validateModelValue\(call\?\.input, PLAN_REPLY\)/.test(planBody)) bad.push('planSeedImages must read the image_plan input through validateModelValue and a schema')
if (/typeof e\.|as Record<string, unknown>|input as /.test(planBody)) bad.push('planSeedImages still walks the image_plan input by hand')
if (!SCHEMA_IMPORT.test(vision)) bad.push('lib/importer/vision.ts must import the shared schema boundary')
const seeder = read('lib/listing-seeder/extract.ts')
if (!/return readListingReply\(block\?\.input, input\.kind\)/.test(seeder) || /input as /.test(seeder)) bad.push('the listing seeder must hand the tool input to readListingReply, uncast')
const whatsapp = read('lib/whatsapp/extract.ts')
if (!/return readItems\(block\?\.input\)/.test(whatsapp) || /input as /.test(whatsapp)) bad.push('the WhatsApp batch must hand the tool input to readItems, uncast')

// 4. The card reader is wired, and the browser helpers stay free of the schema library.
if (!/import \{ coerceExtraction \} from '@\/lib\/connections\/extraction'/.test(read('lib/ai/connections-ai.ts'))) bad.push('the card scan must use the schema reader in lib/connections/extraction.ts')
const browserHelpers = read('lib/connections/normalize.ts')
if (/from '(@\/lib\/ai\/schema|zod|@\/lib\/events\/normalize)'/.test(browserHelpers)) bad.push('lib/connections/normalize.ts is imported by client components and must not pull in the schema library')
if (/export function coerce(Extraction|ContactDetails)\(/.test(browserHelpers)) bad.push('lib/connections/normalize.ts must not keep a second copy of the readers')

// 5. Tests: one valid and one malformed reply per reader, and no model call.
const TESTS = [
  ['lib/whatsapp/extract.test.ts', /stages a valid event and a valid housing post/, /yields no items for a reply that is not the declared shape/],
  ['lib/importer/extract/run.test.ts', /turns a valid reply into a grounded draft and ledger/, /reads a wrong-typed part as absent instead of losing the whole extraction/],
  ['lib/importer/vision.test.ts', /maps a valid reply onto the images by index/, /drops rows it cannot place/],
  ['lib/listing-seeder/extract.test.ts', /reads a valid reply through the schema and hands the coercer the same fields/, /reads a wrong-typed part as absent, so the coercer no longer throws on it/],
  ['lib/launch/buildout.test.ts', /accepts a rewrite that cites their own words/, /a wrong-typed rewrite is dropped, the good one beside it is kept/],
  ['lib/connections/normalize.test.ts', /reads a full valid reply through the schema/, /lets each wrong-typed field fall to its own safe reading/],
  ['lib/events/normalize.test.ts', /reads a valid reply into the stored shape/, /lets each wrong-typed field fall to its own safe reading/],
  ['lib/ai/schema.test.ts', /citedField reads each wrong-typed part as absent/, /unitBox clamps into the unit square/],
]
for (const [file, valid, malformed] of TESTS) {
  const src = read(file)
  if (!valid.test(src)) bad.push(`${file} is missing the valid-reply test matching ${valid}`)
  if (!malformed.test(src)) bad.push(`${file} is missing the malformed-reply test matching ${malformed}`)
}
for (const file of ['lib/whatsapp/extract.test.ts', 'lib/importer/extract/run.test.ts', 'lib/importer/vision.test.ts', 'lib/listing-seeder/extract.test.ts']) {
  if (!/vi\.mock\('@\/lib\/ai\/complete'/.test(read(file))) bad.push(`${file} must mock the model seam: no test may call a model`)
}

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('ok: the seven readers read tool input through a schema; the blocks and the four pure readers hold when run on malformed replies')
