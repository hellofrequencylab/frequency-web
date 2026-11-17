#!/usr/bin/env node
// The search coverage scan of 2026-11-17 (project thread "Make search cover every public item"). One probe per
// open finding: `node scripts/probes/search-coverage-2026-11-17.mjs <ID>`. Each reads source with comments
// stripped and checks the consequence the row names. Exit 1 (FAIL) while the defect stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const DATA = 'app/(main)/search/search-data.ts'
const API = 'app/api/search/route.ts'
const PAGE = 'components/frequency/members/search/search-body.tsx'
const OVERLAY = 'components/search/search-overlay.tsx'

const PROBES = {
  // Member search: the /search page and the live search both find public Journeys, published Spotlights and
  // Market products, the public kinds neither one read before.
  'SRCH-001': () => {
    const f = []
    const data = read(DATA)
    const api = read(API)
    const page = read(PAGE)
    const overlay = read(OVERLAY)
    for (const [fn, kind] of [['searchJourneys', 'journeys'], ['searchSpotlights', 'spotlights'], ['searchMarket', 'market']]) {
      if (!new RegExp(`export async function ${fn}\\(`).test(data)) f.push(`${DATA} has no ${fn} reader`)
      if (!api.includes(`${fn}(`)) f.push(`the live search (${API}) never calls ${fn}`)
      if (!page.includes(`${fn}(`)) f.push(`the /search page never calls ${fn}`)
      if (!new RegExp(`\\['${kind}',`).test(page)) f.push(`the /search page has no ${kind} tab`)
      if (!new RegExp(`'${kind}'`).test(overlay.match(/const CATEGORIES = \[[^\]]*\]/)?.[0] ?? '')) f.push(`the live search has no ${kind} category`)
    }
    if (/journey_plans/.test(data) && !/\.eq\('visibility', 'public'\)/.test(data.slice(data.indexOf('searchJourneys')))) f.push('searchJourneys does not gate on public visibility')
    return f
  },
  // Member search never links to a route the left menu hides (Classifieds, Housing, Around You, Members,
  // Channels); public Journeys stay in by owner ruling 2026-11-17.
  'SRCH-002': () => {
    const f = []
    const page = read(PAGE)
    const api = read(API)
    const overlay = read(OVERLAY)
    if (!has('lib/search/hidden-routes.ts')) f.push('no lib/search/hidden-routes.ts reads the menu rows marked hidden')
    if (/href=\{`\/classifieds\/\$\{/.test(page) && !/hiddenRoutes|isHiddenRoute|routeHidden/.test(page)) f.push('the /search page links every Classifieds listing to /classifieds/<id> with no hidden-route gate')
    if (!/hiddenRoutes|isHiddenRoute|withoutHidden/.test(page)) f.push('the /search page "Go to" list is not filtered by the hidden routes (it offers /housing and /classifieds/new)')
    if (!/hiddenRoutes|isHiddenRoute|withoutHidden/.test(api)) f.push('the live search API does not filter by the hidden routes')
    if (!/hiddenRoutes|isHiddenRoute/.test(overlay)) f.push('the live search "Go to" list (paletteDestinations) still offers hidden routes such as /nearby and /network')
    return f
  },
  // Admin: the Spaces, Circles and Events consoles each have a working search, the way Members, CRM contacts
  // and Practices already do.
  'SRCH-003': () => {
    const f = []
    const spaces = read('app/(main)/admin/spaces/page.tsx')
    if (!/searchParams/.test(spaces) || !/FilterBar|type="search"/.test(spaces)) f.push('/admin/spaces has no search box (it lists every Space with no way to find one)')
    const circles = read('app/(main)/admin/circles/circles-client.tsx') + read('app/(main)/admin/circles/page.tsx')
    if (!/type="search"|FilterBar/.test(circles)) f.push('/admin/circles has no search box')
    const events = read('app/(main)/admin/events/page.tsx') + read('app/(main)/admin/events/posted-events-section.tsx') + read('app/(main)/admin/events/events-admin-list.tsx')
    if (!/FilterBar|placeholder="Search events/.test(events)) f.push('/admin/events has no event search (the only search box there finds members to assign as host)')
    return f
  },
  // Admin: the member roster search reaches every member, not only the newest 200 the page loads.
  'SRCH-004': () => {
    const page = read('app/(main)/admin/members/page.tsx')
    const tab = page.slice(page.indexOf('async function MembersTab'))
    const capped = /\.limit\(200\)/.test(tab)
    const serverSearch = /searchParams[\s\S]*\bq\b/.test(page) && /applySearchTerms|\.or\(|ilike/.test(tab)
    return capped && !serverSearch ? ['/admin/members loads the newest 200 members and its search box only filters those, so an older member cannot be found'] : []
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`usage: node scripts/probes/search-coverage-2026-11-17.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
const failures = probe()
if (failures.length) {
  console.log(`FAIL ${id}`)
  for (const line of failures) console.log(`  - ${line}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
