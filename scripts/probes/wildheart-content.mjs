// THE HANDOFF'S CONTENT CHECKLIST (LIVE-904, owner 2026-10-13: "Use every bit of content from the design
// system to propagate wildheart.academy"). Reads the design handoff's website template (Website.html: the
// six desktop screens, the chrome, the phone's Home and the data the template renders) and the labels of
// the components those screens use, and writes every string longer than three characters, deduplicated,
// per screen, as scripts/probes/wildheart-content-checklist.json. The render harness
// (test/wildheart-site.render.test.tsx) and the ledger probe (scripts/probes/wildheart-fidelity.mjs) read
// that file and fail when a string is missing from the site, so a dropped line is a red test, not a
// reviewer's eye.
//
//   WILDHEART_HANDOFF=<handoff dir> node scripts/probes/wildheart-content.mjs [<out dir>]
//
// The exceptions are the template's placeholders and mock-only strings, each named with its reason, so the
// list can only shrink by building the thing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const handoff = process.env.WILDHEART_HANDOFF
if (!handoff) {
  console.error('WILDHEART_HANDOFF is required')
  process.exit(2)
}
const html = readFileSync(join(handoff, 'Website.html'), 'utf8')

// One pass over the six entities the template uses, so a decoded "&amp;lt;" stays "&lt;" (never unescaped twice).
const ENTITIES = { '&#39;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }
const decode = (s) => s.replace(/&(?:#39|quot|amp|lt|gt|nbsp);/g, (m) => ENTITIES[m])
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim()
/** Every string a stretch of template shows: text nodes, alt and label attributes, split at the template's
 *  own expressions. */
function strings(fragment) {
  const out = []
  const attrs = /\b(?:alt|aria-label|label|title)="([^"]*)"/g
  for (const m of fragment.matchAll(attrs)) if (!/\{\{/.test(m[1])) out.push(m[1])
  const text = fragment
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/\{\{[^}]*\}\}/g, '|')
    .replace(/<[^>]+>/g, '|')
  out.push(...text.split('|'))
  return out
}
const keep = (s) => s.length > 3 && /[A-Za-z]{2}/.test(s) && !/\{\{|\.html|^\.\.\/|^\(/.test(s)
const dedupe = (list) => [...new Set(list.map(clean).filter(keep))]

const at = (marker, from = 0) => {
  const i = html.indexOf(marker, from)
  if (i < 0) throw new Error(`marker not found: ${marker}`)
  return i
}
const home0 = at('<sc-if value="{{ isHome }}"')
const program0 = at('<sc-if value="{{ isProgram }}"')
const year0 = at('<sc-if value="{{ isYear }}"')
const circles0 = at('<sc-if value="{{ isCircles }}"')
const retreat0 = at('<sc-if value="{{ isRetreat }}"')
const about0 = at('<sc-if value="{{ isAbout }}"')
const main1 = at('</main>', about0)
const footer0 = at('<footer', main1)
const mobile0 = at('<sc-if value="{{ isMobile }}"')
const mobile1 = at('</x-dc>', mobile0)
const script0 = at('<script type="text/x-dc"')
const script1 = at('</script>', script0)
const header0 = at('<header')

const screens = {
  chrome: dedupe([...strings(html.slice(header0, home0)), ...strings(html.slice(footer0, mobile0))]),
  home: dedupe(strings(html.slice(home0, program0))),
  program: dedupe(strings(html.slice(program0, year0))),
  year: dedupe(strings(html.slice(year0, circles0))),
  circles: dedupe(strings(html.slice(circles0, retreat0))),
  retreat: dedupe(strings(html.slice(retreat0, about0))),
  about: dedupe(strings(html.slice(about0, main1))),
  mobile: dedupe(strings(html.slice(mobile0, mobile1))),
}

// The template's data: every quoted prose literal in its script (the parts, the path, the beats, the
// pillars, the weeks, the safety lines, the circles, the modules, the phone's nav and choices).
const script = html.slice(script0, script1)
const literals = []
for (const m of script.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
  const raw = (m[1] ?? m[2]).replace(/\\u2019/g, '’').replace(/\\'/g, "'").replace(/\\"/g, '"')
  if (/\s/.test(raw) || /^[A-Z]/.test(raw)) literals.push(raw)
}
screens.data = dedupe(literals).filter((s) => !/^(Home|Member|Host|Admin|Chosen|Program|Year)$/.test(s) || true)

// The labels of the components the website screens use (the handoff's components/calendar and
// components/symbols sources), as those screens show them before any click.
screens.components = dedupe([
  // YearJourney: the readout, the counter, the tips, the stops the sky makes on its own.
  'Calendar', 'Season', 'Moon', 'Skip the year ↓', 'Scroll, or spin the wheel', 'Save my place', 'See the whole year on the sky map →',
  'The turning year. Use arrow keys to move between stops.', 'The year opens', 'The sun enters', 'Full moon · release', 'Foundation begins', 'Circle Nights begin', 'Wildheart Retreat',
  'Read the needle from the outside in: the calendar date, the sign the sun is passing through, the season, and the moon at the centre. Scroll, or take the wheel and turn it.',
  'Signs don\'t line up with months. Each begins around the 20th to 23rd, when the sun crosses into the next twelfth of the sky.',
  'Full moon: the moon sits opposite the sun, fully lit. It comes about every 29½ days, so it drifts through the calendar.',
  'The winter solstice: the longest night. From here the light returns, a minute a day.',
  'A cross-quarter day: the first stirring of spring under the frost.',
  'The spring equinox: day and night in balance, then light wins.',
  'A cross-quarter day: the fire festival halfway to midsummer.',
  'The summer solstice: the longest day, the sun at full height.',
  'A cross-quarter day: the first harvest.',
  'The fall equinox: balance again, then the dark grows.',
  'A cross-quarter day, halfway between the fall equinox and the winter solstice. The old year ends here.',
  'The program year starts with winter: enroll in December, begin the foundation in January.',
  'Eight weeks through Capricorn and Aquarius, the rest-and-root season.',
  'After the foundation, circles meet every other week all year, moving through one module per sign.',
  'The year turns on the thinnest night. Every circle gathers together for three days.',
  // SkyMap centered and compact: the scopes, the groups, the controls, the empty line.
  'In this sign', 'This season', 'All year', 'Festivals', 'Moons', 'Circle Nights', 'Gatherings', 'Prev sign', 'Next sign', 'Spin the year', 'Today', 'Tap any sign to travel there.',
  'Nothing here. Try this season or all year.', 'Coming up', 'Previous sign',
  // The calendar rows the screens show before any click (calendarData.js): the Home rituals and the year
  // page's opening sign.
  "Hunter's Moon", 'Full moon esbat · release', 'Samhain', 'Honour the dead · the veil is thin', 'New moon', 'Intention circle · plant',
  'Cold Moon', 'Enrollment closes', 'Week 1 · Arriving', 'Wolf Moon', 'Hearth Gathering',
  // Astro: the seasons' themes, the houses, the phases, the modules.
  'Rest and root', 'Wild', 'Partners', 'Calling', 'New moon', 'Full moon',
  'Sovereignty', 'Sisterhood', 'Flow', 'Rage', 'Pleasure', 'Voice', 'Mothers and daughters', 'Radiance', 'Devotion', 'Desire and boundaries', 'The Wild', 'Freedom',
])

/** The template's placeholders and mock-only strings, each with its reason. */
const exceptions = [
  ['Maya R', 'the member name is a placeholder (README: "Host names and the member Maya R are placeholders")'],
  ['Maya R ·', 'the member name is a placeholder'],
  ['View as', 'the mock\'s role switcher; Frequency reads the real role from its session'],
  ['Your circle', 'the signed-in account pill, drawn by the membership island for a signed-in member only'],
  ['Member', 'the mock\'s role labels'],
  ['Host', 'the mock\'s role labels'],
  ['Admin', 'the admin chip shows "Admin" only to an admin on the live site'],
  ['founding lead', 'a host placeholder: the Circles block names the real host'],
  ['trained', 'a host placeholder'],
  ['in training', 'a host placeholder'],
  ['Tue Oct 20 · 6:00 PM', 'the mock\'s next Circle Night date; the site reads the Space\'s next Circle Night'],
  ['Tue Oct 20 · 6 PM', 'the mock\'s next Circle Night date'],
  ['Your first night · Tue Oct 20 · 6 PM', 'the mock\'s next Circle Night date'],
  ['Oct 20', 'the mock\'s next Circle Night date'],
  ['Start', 'the phone mock\'s one-page anchor nav; the site\'s phone menu lists its pages'],
  ['The retreat', 'the phone mock\'s one-page anchor nav'],
  ['Website · Wildheart', 'the design tool\'s window title'],
  ['Wildheart Design System', 'the design tool\'s thumbnail'],
  ['Sisters', 'the house name the handoff gives XI; the theme ships it gender-neutral (Community) and the program\'s own copy says sisters'],
  ['Nothing here. Try this season or all year.', 'the sky map\'s empty line, drawn only once a filter empties the list'],
  ['The program year starts with winter: enroll in December, begin the foundation in January.', 'the enrollment stop falls in December, before the year journey\'s window, in the handoff as well'],
  ['Program', 'the nav label under 1180px; the site keeps the full page names'],
  ['Year', 'the nav label under 1180px; the site keeps the full page names'],
]

const out = { source: 'design_handoff_wildheart/Website.html, 2026-10-13', generated: new Date().toISOString().slice(0, 10), screens, exceptions: exceptions.map(([text, why]) => ({ text, why })) }
const dest = resolve(process.argv[2] ?? 'scripts/probes')
mkdirSync(dest, { recursive: true })
const file = join(dest, dest.endsWith('probes') ? 'wildheart-content-checklist.json' : 'content-checklist.json')
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
const total = Object.values(screens).reduce((n, l) => n + l.length, 0)
console.log(`wildheart-content: ${total} strings over ${Object.keys(screens).length} screens -> ${file}`)
