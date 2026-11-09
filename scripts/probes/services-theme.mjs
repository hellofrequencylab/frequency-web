#!/usr/bin/env node
// Services theme build (design-system intake, 2026-11-02). One probe, one area per ledger row:
//   node scripts/probes/services-theme.mjs <intake|foundation|register|chrome|kits|spotlight|email|picker|dials|conformance|danieltyack-blocks>
// Each area passes only when the files that area promises exist and carry what the handoff names. The intake area
// reads the committed snapshot; the rest read the repo, so a row cannot close on a promise.
import { existsSync, readFileSync } from 'node:fs'

const area = process.argv[2]
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const need = (p, re, why) => {
  if (!existsSync(p)) return bad.push(`${p} does not exist (${why})`)
  if (re && !re.test(read(p))) bad.push(`${p} lacks ${re} (${why})`)
}

const checks = {
  intake() {
    need('docs/design-systems/services/rules.json', /"theme": "services"/, 'rules for every file of the zip')
    need('docs/design-systems/services/inventory.json', /sha256/, 'snapshot of the zip')
    need('docs/design-systems/services/baseline.json', /"ids"/, 'known gaps, shrink only')
  },
  foundation() {
    need('lib/theme/services.ts', /SERVICES_TOKENS_CSS/, 'token block the intake compares')
    need('lib/sites/editor/theme-contract.json', /"Services"/, 'themes.Services')
  },
  register() {
    need('lib/themes/manifests/services.manifest.json', /"id": "services"/, 'manifest (generated from MEGA_THEMES)')
    need('lib/theme/mega-theme.ts', /id: 'services'/, 'registered, hidden from every picker')
    need('lib/theme/site-style.ts', /'services'/, 'SiteThemeId')
  },
  chrome() {
    need('components/page-editor/blocks/services.tsx', /ServicesHero/, 'the Services blocks')
    need('components/sites/services-chrome.tsx', /centered/, 'header bar|pill|centered, footer full|minimal')
  },
  kits() {
    need('lib/sites/kits/services-variants.ts', /general/, 'sixteen kits')
  },
  spotlight() {
    need('components/spotlight/services-kit-layouts.tsx', /services-kit:/, 'six layouts')
  },
  email() {
    need('lib/theme/services-kit-email.ts', /inquiry/, 'eleven email types')
    need('lib/theme/site-style.ts', /services/, 'Space page faces and default accent')
  },
  picker() {
    need('app/(marketing)/themes/services/page.tsx', /<FrequencyThemeFeature theme="services"/, '/themes/services on the Nocturne page layout')
    need('lib/theme/site-style.ts', /RETIRED_FROM_PICKERS[^\n]*new Set\((?![^)]*'services')/, 'Services offered in the pickers')
    need('app/sitemap.ts', /\/themes\/services/, '/themes/services in the sitemap')
  },
  dials() {
    need('lib/theme/dials.json', /"corners"/, 'dial registry')
    need('components/sites/editor/theme-controls.tsx', /radiogroup/, 'ThemeControls')
  },
  conformance() {
    need('lib/theme/conformance.ts', /contrast/, 'the ten invariants as pure checks')
  },
  // LIVE-2053: every New World function block reads the Space's own rows off metadata.space, the way the Space content blocks do.
  'danieltyack-blocks'() {
    need('lib/sites/new-world-live.ts', /export function newWorldLiveFrom/, 'memberships, shop and library mapped to block rows, with the function switches')
    need('lib/sites/new-world-live-load.ts', /listMembershipTiers[\s\S]*listPublicSpaceCatalog[\s\S]*getSpacePractices/, 'the server read through the Space readers')
    need('components/page-editor/blocks/new-world.tsx', /readNewWorldLive/, 'plans, shop and posts read the live lists and render nothing when the function is off')
    need('components/page-editor/blocks/new-world.tsx', /liveTeam[\s\S]*liveGroups[\s\S]*hoursRows/, 'team, groups and where-to-find-us read the Space team, circles and business info')
    need('components/sites/site-page.tsx', /docHasNewWorldBlocks\(websitePage\.doc\) \? loadNewWorldLive/, 'the site render attaches the rows only when the page draws a New World block')
  },
  // LIVE-2052: Daniel Tyack's website wears the New World General kit with his own words carried over. The builder and its
  // generator live in the repo; the row closes only once the generated SQL has run in production and the apply record says so.
  danieltyack() {
    need('lib/sites/new-world-site.ts', /export function newWorldSiteFor/, 'the kit apply that carries the owner words')
    need('scripts/new-world-site-sql.mjs', /NEW_WORLD_SITE_INPUT/, 'the SQL generator')
    const record = 'docs/design-systems/new-world/danieltyack-site.json'
    need(record, /"applied"/, 'the apply record')
    if (existsSync(record)) {
      const applied = JSON.parse(read(record)).applied
      if (!applied || typeof applied.revision !== 'number' || !applied.date) bad.push(`${record}: applied is empty (the SQL has not run in production yet)`)
    }
  },
}
if (!checks[area]) {
  console.error(`unknown area "${area}"`)
  process.exit(2)
}
checks[area]()
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`services theme: ${area} ok`)
