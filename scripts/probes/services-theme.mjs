#!/usr/bin/env node
// Services theme build (design-system intake, 2026-11-02). One probe, one area per ledger row:
//   node scripts/probes/services-theme.mjs <intake|foundation|register|chrome|kits|spotlight|email|picker|dials|conformance>
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
    need('app/themes/services/page.tsx', /Services/, '/themes/services on the Nocturne page layout')
  },
  dials() {
    need('lib/theme/dials.json', /"corners"/, 'dial registry')
    need('components/sites/editor/theme-controls.tsx', /radiogroup/, 'ThemeControls')
  },
  conformance() {
    need('lib/theme/conformance.ts', /contrast/, 'the ten invariants as pure checks')
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
