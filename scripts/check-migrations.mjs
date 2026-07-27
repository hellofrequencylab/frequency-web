#!/usr/bin/env node
// Migration filename contract (DOCS-PROTOCOL "supabase/migrations is a source of truth").
//
// The Supabase migration ledger (`supabase_migrations.schema_migrations`) keys on the VERSION —
// the digits before the first underscore — and that column is the primary key. Two files sharing
// one version are therefore not "two migrations that both run": the first one applied records the
// version, and every later file with the same version is silently SKIPPED on `supabase db push`
// and on a `db reset` replay. Nothing errors. The schema simply comes out missing whatever the
// skipped file did, which only surfaces later on a fresh environment (local dev, a preview branch,
// a disaster-recovery rebuild) where the app then fails against a schema it was never tested on.
//
// This is not hypothetical: three collisions existed simultaneously in this repo
// (20260924000000, 20260925000000, 20261005000000), each hiding a real migration — an events
// timezone column, an orphan-retirement pass, and the supporter_contributions table. Production
// was fine because each half had been applied by hand through MCP, which is exactly what made the
// drift invisible: the ledger recorded one name per version and the repo looked ordered.
//
// The guard therefore enforces two things a reviewer cannot eyeball across 500+ files:
//   1. Every version is UNIQUE.
//   2. Every filename parses as `<14-digit version>_<name>.sql`, so the version a file claims is
//      the version the CLI will actually record. A malformed name sorts unpredictably and can
//      apply out of order relative to the migration it depends on.
//
// Ordering itself is deliberately NOT checked: filenames here are hand-assigned rather than
// CLI-stamped, and are already required to sort correctly by (1) + (2).
//
// Usage: `node scripts/check-migrations.mjs` (or `pnpm check:migrations`). Exits 1 on violation.
// Model: scripts/check-headers.mjs.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join('supabase', 'migrations')
// The shape `supabase db push` parses: 14 digits, an underscore, a name, `.sql`.
const FILENAME = /^(\d{14})_([A-Za-z0-9_.-]+)\.sql$/

export function runCheck() {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

  const malformed = files.filter((f) => !FILENAME.test(f))

  const byVersion = new Map()
  for (const f of files) {
    const m = FILENAME.exec(f)
    if (!m) continue
    const v = m[1]
    if (!byVersion.has(v)) byVersion.set(v, [])
    byVersion.get(v).push(f)
  }
  const collisions = [...byVersion.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([version, fs]) => ({ version, files: fs }))

  return { total: files.length, malformed, collisions }
}

function main() {
  const { total, malformed, collisions } = runCheck()

  if (malformed.length === 0 && collisions.length === 0) {
    console.log(
      `✓ Migration contract: ${total} migration(s), every version unique and every filename ` +
        'parseable (no silently-skipped migration on a fresh apply).',
    )
    return
  }

  console.error('\n✗ Migration contract check failed:\n')

  for (const c of collisions) {
    console.error(`  • version ${c.version} is claimed by ${c.files.length} files:`)
    for (const f of c.files) console.error(`      ${DIR}/${f}`)
    console.error(
      '      Only ONE of these will ever apply — the ledger keys on the version, so the rest are\n' +
        '      skipped with no error on `db push` / `db reset`.\n',
    )
  }

  for (const f of malformed) {
    console.error(`  • ${DIR}/${f} — filename is not <14-digit version>_<name>.sql\n`)
  }

  console.error(
    'Fix: renumber the colliding file(s) to a free version that still sorts AFTER anything they\n' +
      'depend on (a +000100 bump next to the original is usually right, e.g. 20260924000000 ->\n' +
      '20260924000100), then reconcile the production ledger so the new version is recorded as\n' +
      'applied — otherwise the next push tries to re-run it. See docs/DATABASE.md.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
