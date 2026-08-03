#!/usr/bin/env node
// check:admin-client — the admin-client RATCHET (tenancy walls, ADR-923).
//
// The service-role client (lib/supabase/admin.ts) bypasses RLS entirely, so every file that
// imports it is a file where tenant isolation rests on app-layer guards alone. The tenancy-walls
// phase put DB-enforced per-Space policies under the space_*/CRM tables; the payoff only compounds
// if admin-client usage RATCHETS DOWN as surfaces converge onto the caller's session client
// (which the policies now support). This guard freezes today's importer set as a baseline:
//
//   * a file NOT on the baseline that imports the admin client FAILS CI — new code must justify
//     an RLS bypass by adding itself to the baseline in the same PR (a visible, reviewable act),
//   * a baseline entry whose file no longer imports it is reported so the list only shrinks,
//   * `--update` regenerates the baseline from reality (use after converging or adding a file).
//
// This is a per-file ratchet, not a count: swapping one bypass for another cannot hide inside a
// stable total. Baseline: scripts/admin-client-baseline.txt (one path per line, sorted).
//
// Usage: node scripts/check-admin-client.mjs [--update]

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASELINE = join('scripts', 'admin-client-baseline.txt')
const ROOTS = ['app', 'lib', 'components', 'test', 'scripts']
const IMPORT_RE = /from\s+['"]@\/lib\/supabase\/admin['"]/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      walk(p, out)
    } else if (/\.(ts|tsx|mts)$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

export function findImporters() {
  const files = ROOTS.flatMap((r) => {
    try { return walk(r) } catch { return [] }
  })
  // The definition itself is not an importer.
  return files
    .filter((f) => f !== join('lib', 'supabase', 'admin.ts'))
    .filter((f) => IMPORT_RE.test(readFileSync(f, 'utf8')))
    .map((f) => f.replaceAll('\\', '/'))
    .sort()
}

export function loadBaseline() {
  return new Set(
    readFileSync(BASELINE, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  )
}

function main() {
  const importers = findImporters()

  if (process.argv.includes('--update')) {
    writeFileSync(
      BASELINE,
      '# check:admin-client baseline — every file allowed to import the RLS-bypassing service-role\n' +
        '# client (lib/supabase/admin.ts). Frozen by the tenancy-walls ratchet (ADR-923): a new\n' +
        '# importer fails CI unless added here in the same PR; converge files onto the session\n' +
        '# client and regenerate with `node scripts/check-admin-client.mjs --update` so this list\n' +
        '# only shrinks. Do not add entries by hand without a reason the reviewer can see.\n' +
        importers.join('\n') +
        '\n',
    )
    console.log(`✓ admin-client baseline regenerated: ${importers.length} importer(s)`)
    return
  }

  const baseline = loadBaseline()
  const current = new Set(importers)
  const added = importers.filter((f) => !baseline.has(f))
  const removable = [...baseline].filter((f) => !current.has(f)).sort()

  if (added.length === 0) {
    console.log(
      `✓ admin-client ratchet: ${importers.length} importer(s), no new RLS-bypass adopters ` +
        `(baseline ${baseline.size}).` +
        (removable.length
          ? `\n  ${removable.length} baseline entr(ies) no longer import it — shrink the baseline:` +
            `\n    node scripts/check-admin-client.mjs --update`
          : ''),
    )
    return
  }

  console.error(`✗ admin-client ratchet: ${added.length} NEW file(s) import the service-role client (RLS bypass):\n`)
  for (const f of added) console.error(`    - ${f}`)
  console.error(
    '\n  The tenancy walls only hold where reads/writes run under RLS. Prefer the session client\n' +
      '  (lib/supabase/server.ts) — the space_*/CRM tables now carry per-Space policies. If this\n' +
      '  file genuinely needs the bypass (cron, webhook, cross-tenant staff surface), add it to\n' +
      '  scripts/admin-client-baseline.txt in this PR with a justifying commit message, or run:\n' +
      '    node scripts/check-admin-client.mjs --update\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
