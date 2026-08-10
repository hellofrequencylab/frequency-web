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

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join('supabase', 'migrations')
// The shape `supabase db push` parses: 14 digits, an underscore, a name, `.sql`.
const FILENAME = /^(\d{14})_([A-Za-z0-9_.-]+)\.sql$/

/** Floor for the migration corpus. Shared value with check:grants (MIN_MIGRATIONS) and check:rls,
 *  which read the same directory — a gate that scans nothing passes everything. */
export const MIN_MIGRATIONS = 400

// ── Rule 3: a migration that reseeds MENU DATA has to say what to do afterwards. ──────────────
//
// The menu surfaces are DB-seeded, and the read path is a plain uncached query — but
// `app/(marketing)/layout.tsx` deliberately avoids cookies()/getUser() so marketing pages stay
// STATIC with `revalidate = 3600`. That is what makes the menu cacheable at all, and it is why
// all 18 Menu Manager mutations call `revalidatePath('/', 'layout')` after every write.
//
// Raw SQL cannot call revalidatePath. So a migration that changes a seeded menu leaves the static
// surfaces serving the OLD rail until either the ISR window rolls or a deploy rebuilds them.
//
// ⚠️ THE PLAN OVERSTATED THIS as "serves a stale rail until the next deploy". It is bounded: ISR
// picks it up within `revalidate = 3600`, so the worst case is one hour, not forever. Recorded
// because a hazard described as worse than it is gets discounted once someone checks.
//
// A gate cannot make SQL flush a cache. What it CAN do is refuse a migration that changes menus
// without stating the consequence, so the operator who applies it knows the rail is stale and the
// reviewer sees it in the diff. Hence a marker, not a fix.
const MENU_TABLES = ['menus', 'menu_items', 'menu_categories', 'menu_settings', 'menu_rail_cards']
const MENU_WRITE = new RegExp(
  `\\b(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?(?:${MENU_TABLES.join('|')})\\b`,
  'i',
)
const MENU_MARKER = /--\s*MENU CACHE:/i

/** Blank both SQL comment forms, length-preserving (same reason as check-grants.mjs: a menu write
 *  inside a rollback comment is not a menu write). The MARKER is looked for in the RAW text, since
 *  the marker is itself a comment. */
export function stripSqlComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\n)([ \t]*--[^\n]*)/g, (_m, lead, body) => lead + blank(body))
}

/** Files that write seeded menu data without a `-- MENU CACHE:` note. */
export function menuWritesMissingNote(files, read) {
  const out = []
  for (const f of files) {
    const raw = read(f)
    if (!MENU_WRITE.test(stripSqlComments(raw))) continue
    if (MENU_MARKER.test(raw)) continue
    out.push(f)
  }
  return out
}

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

  const menuNoteMissing = menuWritesMissingNote(files, (f) => readFileSync(join(DIR, f), 'utf8'))

  return { total: files.length, malformed, collisions, menuNoteMissing }
}

function main() {
  const { total, malformed, collisions, menuNoteMissing } = runCheck()

  // `total` was reported but never asserted, so "✓ Migration contract: 0 migration(s), every
  // version unique" was a reachable success line — a vacuous pass on the directory that decides
  // what ships to the database. The floor sits under the live corpus (597 on 2026-08-10) and far
  // above zero. check:grants and check:rls read this same directory and floor it at the same 400.
  if (total < MIN_MIGRATIONS) {
    console.error(
      `✗ Migration contract read only ${total} migration(s) from ${DIR}, expected at least ` +
        `${MIN_MIGRATIONS}. Uniqueness across an empty set is trivially true, so this is a broken ` +
        'read rather than a clean run.',
    )
    process.exit(1)
  }

  if (malformed.length === 0 && collisions.length === 0 && menuNoteMissing.length === 0) {
    console.log(
      `✓ Migration contract: ${total} migration(s), every version unique, every filename ` +
        'parseable (no silently-skipped migration on a fresh apply), and every menu reseed\n' +
        '  carrying its cache note.',
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

  for (const f of menuNoteMissing) {
    console.error(`  • ${DIR}/${f} writes seeded MENU data with no \`-- MENU CACHE:\` note.`)
    console.error(
      '      Raw SQL cannot call revalidatePath, so the static marketing surfaces keep serving the\n' +
        '      OLD rail until ISR rolls (revalidate = 3600) or a deploy rebuilds them. All 18 Menu\n' +
        '      Manager mutations flush it; a migration cannot. Say so in the file:\n' +
        '\n' +
        '        -- MENU CACHE: reseeds the <surface> menu. Static surfaces serve the old rail for\n' +
        '        -- up to an hour (ISR) unless a deploy follows. Deploy after applying, or touch any\n' +
        '        -- menu in Menu Manager to fire revalidatePath(\'/\', \'layout\').\n',
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
