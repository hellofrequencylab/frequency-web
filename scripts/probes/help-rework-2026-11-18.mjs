#!/usr/bin/env node
// The help center rework of 2026-11-18 (project thread "Rework every help doc and help search"). One
// probe per row: `node scripts/probes/help-rework-2026-11-18.mjs <ID>`. Each checks the consequence its
// row names, on the files a reader or a search box actually gets. Exit 1 (FAIL) while the defect stands.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const raw = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
const code = (p) =>
  raw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const HELP = 'content/help'
const articles = (category) =>
  has(`${HELP}/${category}`)
    ? readdirSync(new URL(`${HELP}/${category}`, root))
        .filter((f) => f.endsWith('.md'))
        .map((f) => `${HELP}/${category}/${f}`)
    : []
const frontMatter = (p) => raw(p).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
const field = (p, key) => frontMatter(p).match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? ''

/** Every published article in these folders was reviewed in the rework and carries search keywords. */
function reviewed(categories, floor) {
  const f = []
  const files = categories.flatMap(articles)
  if (files.length < floor) f.push(`read only ${files.length} article(s) in ${categories.join(', ')}, expected at least ${floor}`)
  for (const p of files) {
    if (field(p, 'updated') < '2026-11-18') f.push(`${p} was not reviewed in the rework (updated: ${field(p, 'updated') || 'missing'})`)
    const keywords = field(p, 'keywords').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
    if (keywords.length < 3) f.push(`${p} carries ${keywords.length} search keyword(s), so help search only finds it by its title`)
  }
  return f
}

/** A stale claim the audit found: the article must no longer say it. */
const gone = (p, pattern, what) => (pattern.test(raw(p)) ? [`${p} still says ${what}`] : [])
/** The fact the code shows: the article must say it. */
const says = (p, pattern, what) => (pattern.test(raw(p)) ? [] : [`${p} does not say ${what}`])

const PROBES = {
  // One matcher behind every help search box; it reads keywords and section headings and links to the section.
  'SRCH-005': () => {
    const f = []
    const search = code('lib/help/search.ts')
    if (!/export function searchHelp\(/.test(search)) f.push('lib/help/search.ts has no searchHelp')
    if (!/sectionTitle/.test(search) || !/\bto:/.test(search)) f.push('a search hit cannot point at the section that matched')
    if (!/entry\.keywords/.test(search)) f.push('search does not read an article\'s keywords')
    if (!/SYNONYM/.test(search) || !/STOP/.test(search)) f.push('search has no synonym list or filler-word list, so a plain question finds nothing')
    const index = code('lib/help/content.ts')
    if (!/keywords:/.test(index) || !/sections:/.test(index)) f.push('the search index (lib/help/content.ts getSearchIndex) carries no keywords or sections')
    if (!/keywords: arr\(data\.keywords\)/.test(code('lib/help/content-core.ts'))) f.push('the article parser drops the keywords front matter')
    for (const p of [
      'components/frequency/site/pages/help/help-client.tsx',
      'components/frequency/members/help/help-search-pill.tsx',
      'components/vera/vera-launcher.tsx',
    ]) {
      const src = code(p)
      if (!/searchHelp\(/.test(src)) f.push(`${p} does not use the shared matcher`)
      if (!/\.to\b/.test(src)) f.push(`${p} never links a hit to its section`)
    }
    if (!has('lib/help/search.test.ts')) f.push('the matcher has no test')
    return f
  },
  // Space owner guides match the product, and the features with no guide have one.
  'LIVE-2385': () => {
    const f = reviewed(['spaces'], 20)
    for (const [p, key] of [
      ['spaces/create-a-space', 'create-space'],
      ['spaces/spotlight', 'spotlight'],
      ['spaces/themes', 'themes'],
      ['getting-started/get-help', 'support'],
      ['getting-started/manage-your-emails', 'notifications'],
      ['getting-started/finding-your-way-around', 'onboarding'],
      ['the-quest/free-courses', 'journeys'],
    ]) {
      const file = `${HELP}/${p}.md`
      if (!has(file)) f.push(`no guide at /help/${p}`)
      else if (!field(file, 'featureKeys').includes(key)) f.push(`${file} is not tied to the ${key} feature key`)
    }
    const keys = code('lib/help/feature-keys.ts')
    for (const key of ['create-space', 'spotlight', 'themes', 'support']) {
      if (!new RegExp(`key: '${key}'`).test(keys)) f.push(`lib/help/feature-keys.ts has no ${key} key`)
    }
    f.push(...gone(`${HELP}/spaces/your-website.md`, /two themes/i, 'there are two themes'))
    f.push(...says(`${HELP}/spaces/your-website.md`, /New World/, 'New World is a theme'))
    f.push(...gone(`${HELP}/spaces/billing.md`, /any admin can make changes/i, 'an admin can change billing (owner only)'))
    f.push(...says(`${HELP}/spaces/plan-your-calendar.md`, /Agenda/, 'the calendar has an Agenda view'))
    return f
  },
  // The first guides a new member reads match the product.
  'LIVE-2386': () => {
    const f = reviewed(['getting-started', 'connecting', 'find-your-people'], 30)
    f.push(...says(`${HELP}/getting-started/how-to-rsvp.md`, /\*\*Maybe\*\*/, 'Maybe is an RSVP answer'))
    f.push(...gone(`${HELP}/getting-started/how-to-rsvp.md`, /\*\*Interested\*\*/, 'Interested is an RSVP answer'))
    for (const p of ['connecting/your-location', 'connecting/matching-and-romance', 'connecting/find-people', 'getting-started/safety-and-account']) {
      f.push(...gone(`${HELP}/${p}.md`, /Connections (&|and) Location/i, 'Settings has a Connections & Location section'))
    }
    f.push(...says(`${HELP}/connecting/messages.md`, /Start a room/, 'how to start a room'))
    f.push(...says(`${HELP}/getting-started/notifications.md`, /manage-emails|Manage your emails|manage-your-emails/, 'where email preferences live'))
    return f
  },
  // The Quest, groups, leading, membership, safety and sharing guides match the product.
  'LIVE-2387': () => {
    const f = reviewed(['the-quest', 'groups', 'leading', 'membership', 'safety', 'sharing'], 30)
    f.push(...gone(`${HELP}/the-quest/leaderboard.md`, /no global board/i, 'there is no global board'))
    f.push(...gone(`${HELP}/the-quest/streaks.md`, /two weeks/i, 'a streak rest runs two weeks'))
    f.push(...says(`${HELP}/groups/talk-on-a-space.md`, /\*\*Community\*\*/, 'the conversation lives on the Community tab'))
    f.push(...says(`${HELP}/groups/events.md`, /pace \(calm or active\)/i, 'the pace filter (calm or active)'))
    f.push(...gone(`${HELP}/membership/crew.md`, /Not right now/, 'there is a Not right now button'))
    f.push(...says(`${HELP}/sharing/build-a-journey.md`, /The Quest/, 'Journeys are reached from The Quest'))
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`usage: help-rework-2026-11-18.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
const failures = probe()
if (failures.length) {
  console.error(`FAIL ${id}`)
  for (const line of failures) console.error(`  - ${line}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
