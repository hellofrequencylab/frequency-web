// Probes for the SCAN-1110..1144 rows filed by the 2026-10-26 full repo meta scan.
// Usage: node scripts/probes/meta-scan-2026-10-26.mjs <key>
// Exit 0 only when the named repair has landed; each key fails on main today.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const has = (p, re) => re.test(read(p))
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const n = e.name
    const p = join(dir, n)
    if (n === 'node_modules' || n === '.next') continue
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css|mjs)$/.test(n) && !/\.test\./.test(n)) out.push(p)
  }
  return out
}
const filesMatching = (dirs, re) => dirs.flatMap((d) => walk(d)).filter((f) => re.test(read(f)))
const countMatches = (dirs, re) =>
  dirs.flatMap((d) => walk(d)).reduce((n, f) => n + (read(f).match(re) || []).length, 0)

const checks = {
  'adr-frequency-only': () =>
    (existsSync('docs/ledger/adr') ? readdirSync('docs/ledger/adr').map((f) => read(join('docs/ledger/adr', f))) : [])
      .concat(read('docs/DECISIONS.md'))
      .some((t) => /only platform design|Frequency is the only (platform )?design|DAWN (is )?(no longer|not) (selectable|deployable)/i.test(t)),
  'row-1328-probe': () => !/check-email-node-render/.test(read('docs/ledger/rows/LIVE-1328.json')),
  'home-faq': () => has('lib/page-editor/templates/home.ts', /faq/i),
  'opening-date': () => has('components/frequency/site/pages/home/frequency-home.tsx', /OPENING_DATE_(ISO|LABEL)/),
  'commons-literal': () => !/#7C766F/i.test(read('app/themes/frequency/site-niche.css')),
  'contrast-gate': () => has('scripts/check-contrast.mjs', /themes\/frequency|frequency\.css/),
  'axe-frequency': () => /\[(frequency|stage|commons)[^\]]*\]/i.test(read('test/e2e/a11y-baselines.json')),
  'dialogs-escape': () => ['components/admin/library/apps-lane.tsx', 'components/admin/library/splash-lane.tsx'].every((f) => has(f, /Escape/)),
  'onair-lazy': () => has('components/on-air/mindless.tsx', /dynamic\(/),
  'shell-lazy': () => has('components/layout/app-shell.tsx', /dynamic\([^)]*admin-bar|dynamic\([^)]*search-overlay/s),
  'hero-preload': () => filesMatching(['components/frequency/site/pages/home', 'app'], /as=["']image["']|preload\(\s*["'`][^)]*image/).length > 0,
  'asset-cache': () => has('next.config.ts', /\/brand\/|\/images\/site/),
  'proxy-anon': () => has('proxy.ts', /auth-token|hasSessionCookie|sb-.*-auth/),
  'ssrf-og': () => has('lib/og/remote-image.ts', /remote-logo|isPrivateIp|assertPublic/),
  'small-hardening': () => has('lib/cron-auth.ts', /VERCEL_ENV|ALLOW_UNAUTHENTICATED_CRON/) && has('app/api/vitals/route.ts', /rate-?limit/i),
  'airtime-day': () => has('app/(main)/on-air/actions.ts', /dispatch-day|dayKey|timeZone/),
  'events-today': () => !/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(read('lib/events/store.ts')),
  'dawn-ui': () => filesMatching(['components/ui', 'components/templates'], /SITE_DESIGN/).length === 0,
  'dawn-public': () => filesMatching(['app/(marketing)', 'app/(public)', 'app/discover', 'app/(help)', 'app/for'], /SITE_DESIGN/).length === 0,
  'dawn-member': () => filesMatching(['app/(main)'], /SITE_DESIGN/).length === 0,
  'legacy-axes': () => filesMatching(['lib', 'app', 'components'], /LEGACY_THEME_AXES/).length === 0,
  'kit-chrome': () => !/prose-gray/.test(read('components/legal/legal-page.tsx')) && !/min-h-screen/.test(read('components/crm/leads/capture-shell.tsx')),
  'shell-px': () => ['components/layout/app-shell-mobile.tsx', 'components/layout/app-shell-nav-list.tsx'].every((f) => !/\[\d+px\]/.test(read(f))),
  'raw-buttons': () => countMatches(['app', 'components'], /<button[^>]*?bg-primary/gs) < 30,
  'calendar-views': () => !/ComingSoonMark/.test(read('components/spaces/calendar-mode-toggle.tsx')),
  'money-tests': () => existsSync('lib/commerce/disputes.test.ts') && existsSync('lib/spaces/booking-actions.test.ts'),
  'e2e-surfaces': () => has('test/e2e/surfaces.ts', /\/offer/) && has('test/e2e/surfaces.ts', /\/for\//),
  'docs-dawn': () => !/design:use dawn/.test(read('docs/START-HERE.md')) && !/blank or unknown is DAWN/i.test(read('.env.example')),
  'lighthouse-member': () => /events|spaces|members|mobile/i.test(read('lighthouserc.json')),
  'sitemap-guides-lastmod': () => has('app/sitemap.ts', /GUIDE_LAST_MODIFIED/),
  'footer-doors': () => has('lib/frequency/site-nav.ts', /\/for\/studios/),
  'org-jsonld': () => has('lib/jsonld.ts', /contactPoint/),
  'drag-alt': () => has('components/admin/menu/menu-arrange-board.tsx', /Move up|moveUp|ArrowUp/),
  'lint-promises': () => has('eslint.config.mjs', /no-floating-promises/),
  'headers-gate': () => existsSync('scripts/check-security-headers.mjs'),
}

const key = process.argv[2]
if (!checks[key]) {
  console.error(`unknown key ${key}; known: ${Object.keys(checks).join(', ')}`)
  process.exit(2)
}
const ok = Boolean(checks[key]())
console.log(`${key}: ${ok ? 'repaired' : 'not yet repaired'}`)
process.exit(ok ? 0 : 1)
