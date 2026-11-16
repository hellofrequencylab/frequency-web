// PROG-E2B: Space profile sections come from the one block registry.
// Consequences measured, by loading the real modules:
//   1. the derived list equals the frozen fourteen sections, byte for byte (what a Space profile offers and in
//      what order did not change);
//   2. every section is backed by a live ENTITY_BLOCKS row a Space may hold (same label, order and function
//      gate), so the list is a view of the registry and not a second catalog;
//   3. the hand-written catalog is gone and nothing imports it;
//   4. the block-system ratchet recorded the fold (4 or lower; later folds only lower it).
import fs from 'node:fs'
import path from 'node:path'
const bad = []

const FROZEN = [
  ['about', 'About', 'Who this space is and what it offers.', null, 10],
  ['story', 'Story', 'The longer story of this space.', null, 15],
  ['highlights', 'Highlights', 'Live counts and standout stats.', null, 20],
  ['offerings', 'Offerings', 'The services or products members can book or buy.', null, 30],
  ['booking', 'Booking', 'Pick a time and book a session.', 'availability', 40],
  ['memberships', 'Memberships', 'A button that opens your membership plans.', 'memberships', 45],
  ['events', 'Events', 'Upcoming events to show up to.', null, 50],
  ['practices', 'Practices and journeys', 'Practices and journeys to start here.', null, 60],
  ['circles', 'Circles', 'The community circles inside this space.', null, 70],
  ['team', 'Team', 'The people who run this space.', 'members', 80],
  ['reviews', 'Reviews', 'What members say.', null, 90],
  ['faq', 'FAQ', 'Common questions, answered.', null, 100],
  ['contact', 'Contact and hours', 'How and when to reach this space.', null, 120],
  ['business', 'Business presence', 'Find this space online.', null, 130],
].map(([id, label, description, requiresFunction, order]) => ({ id, label, description, requiresFunction, types: ['*'], order }))

const MODULE = 'lib/entity-blocks/space-profile.ts'
if (!fs.existsSync(MODULE)) bad.push(`${MODULE} does not exist: profile sections are not read from the registry`)
else {
  const { PROFILE_BLOCKS, profileBlockById, defaultProfileLayout } = await import(`../../../${MODULE}`)
  const { ENTITY_BLOCKS, blockSupportsKind } = await import('../../../lib/entity-blocks/registry.ts')
  if (JSON.stringify(PROFILE_BLOCKS) !== JSON.stringify(FROZEN)) bad.push('the derived section list is not the frozen fourteen, byte for byte')
  for (const section of PROFILE_BLOCKS) {
    const row = ENTITY_BLOCKS.find((b) => blockSupportsKind(b, 'space') && b.order === section.order && b.label === section.label)
    if (!row) bad.push(`${section.id} has no ENTITY_BLOCKS row a Space may hold`)
    else if ((row.requiresFunction ?? null) !== section.requiresFunction) bad.push(`${section.id} does not take its function gate from the registry`)
  }
  for (const id of ['stats', 'journeys', 'updates', 'nope']) if (profileBlockById(id) !== null) bad.push(`${id} now validates as a profile section id`)
  const all = defaultProfileLayout('business', new Set(['availability', 'memberships', 'members'])).join(',')
  if (all !== FROZEN.map((r) => r.id).join(',')) bad.push('the full default layout changed')
  const none = defaultProfileLayout('business', new Set()).join(',')
  if (none !== 'about,story,highlights,offerings,events,practices,circles,reviews,faq,contact,business') bad.push('the default layout with no functions on changed')
}

if (fs.existsSync('lib/spaces/profile-blocks.ts')) bad.push('lib/spaces/profile-blocks.ts still exists: there are two catalogs of the same sections')
const IMPORTS_OLD = /from\s+['"](?:[^'"]*spaces\/profile-blocks|\.\/profile-blocks)(?:\.ts)?['"]/
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && IMPORTS_OLD.test(fs.readFileSync(p, 'utf8'))) bad.push(`${p} still imports the old profile catalog`)
  }
}
for (const dir of ['app', 'components', 'lib']) walk(dir)

if (!fs.existsSync('lib/entity-blocks/space-profile.golden.test.ts')) bad.push('the goldens that freeze the section list are gone')

const led = JSON.parse(fs.readFileSync('scripts/block-baselines.json', 'utf8'))
const entry = (led.entries ?? []).find((e) => e.key === 'block-systems')
if (!entry || typeof entry.baseline !== 'number' || entry.baseline > 4) bad.push(`block-systems reads ${entry?.baseline}; the fold must be recorded (4 or lower)`)

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
