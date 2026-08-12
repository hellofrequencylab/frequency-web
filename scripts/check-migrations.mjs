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
// ── Rule 4 (ADR pending): the repo and the LEDGER HEAD must be the same set. ──────────────────
//
// Rules 1–3 all read the TREE. They prove the filenames are well-formed and cannot collide; they
// prove nothing about whether the database ever ran them. That gap is the one that keeps biting:
// repo⇄ledger divergence has landed THREE times, twice in a single day (2026-08-11/12), and until
// now it was caught only INDIRECTLY — by a hand-pinned count and two hand-pinned sha256 digests in
// scripts/maintenance/ledger-parity.test.ts, re-frozen by a human on every apply. That pin's own
// comment forbids re-freezing it from the repo alone, because a digest re-read from the tree
// asserts only that the tree agrees with itself. A guard whose correctness depends on a human
// doing a fiddly thing right, every time, has already failed.
//
// So the comparison now happens HERE, live, against `supabase_migrations.schema_migrations`, and a
// divergence fails this guard directly. No pinned numbers: both sides are read at run time.
//
// ⚠️ HOW IT DEGRADES, WHICH IS THE WHOLE DESIGN. CI has no database credentials. A gate that
// passes vacuously when it cannot reach the DB is worse than no gate at all (check:og-trace spent
// months matching nothing because its regex was anchored to a filename — see that file's header).
// So there are FOUR outcomes here, never three:
//
//   • no credentials at all   -> SKIPPED, loudly, naming exactly what was and was NOT proved.
//                                Exit 0 — the tree-only rules did run and did pass.
//   • HALF the credentials    -> FAILURE. A half-armed guard is a config bug that silently
//                                disarms this rule forever, which is the failure mode above
//                                wearing a different hat.
//   • credentials + a fetch,
//     parse or floor failure  -> FAILURE. Never a fallback to skip.
//   • credentials + a read    -> the real comparison, on BOTH columns.
//
// Arm it with SUPABASE_ACCESS_TOKEN (secret) + SUPABASE_PROJECT_REF, or hand it a pre-fetched
// payload with `--ledger <file>` / MIGRATION_LEDGER_JSON. `--require-ledger` turns the skip into a
// failure, for any environment that is supposed to have a database and must prove it.
//
// The comparison itself — the pairing logic, the digests, the repair text — is NOT reimplemented
// here. It is imported from scripts/maintenance/ledger-parity.mjs, so the repo has exactly ONE
// digest algorithm and one report. Two copies would drift, and a drifted drift-detector is worse
// than none.
//
// Usage:
//   node scripts/check-migrations.mjs                    # tree rules; ledger if env is armed
//   node scripts/check-migrations.mjs --ledger l.json    # tree rules + a pre-fetched ledger
//   node scripts/check-migrations.mjs --require-ledger   # fail rather than skip the ledger rule
//   node scripts/check-migrations.mjs --no-ledger        # tree rules only, on purpose
// Exits 1 on violation. Model: scripts/check-headers.mjs.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  LEDGER_QUERY,
  compare,
  formatReport,
  parseLedger,
  repoRows,
} from './maintenance/ledger-parity.mjs'

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

// ── Rule 4 plumbing: where the ledger comes from, and what "no ledger" is allowed to mean. ─────

/** Env vars that arm the live read. Named here so the skip message can print them verbatim
 *  rather than describing them, which is the difference between a message you can act on and a
 *  message you have to research. */
export const LEDGER_ENV = Object.freeze({
  TOKEN: 'SUPABASE_ACCESS_TOKEN',
  REF: 'SUPABASE_PROJECT_REF',
  FILE: 'MIGRATION_LEDGER_JSON',
})

/** The Management API endpoint the maintenance sweep already uses for this exact query. */
const QUERY_URL = (ref) => `https://api.supabase.com/v1/projects/${ref}/database/query`

export function parseArgs(argv = []) {
  const at = argv.indexOf('--ledger')
  return {
    ledgerFile: at !== -1 ? argv[at + 1] : undefined,
    requireLedger: argv.includes('--require-ledger'),
    noLedger: argv.includes('--no-ledger'),
  }
}

/**
 * Decide how (or whether) to read the ledger.
 *
 * The `partial` kind exists because "one of the two vars is set" is NOT the same state as "no
 * database configured". It means someone armed this and it silently stopped working — the exact
 * shape of regression this repo keeps buying, so it resolves to a failure rather than a skip.
 */
export function resolveLedgerSource({ env = {}, argv = [] } = {}) {
  const { ledgerFile, requireLedger, noLedger } = parseArgs(argv)

  if (noLedger) return { kind: 'off', requireLedger }

  const file = ledgerFile ?? env[LEDGER_ENV.FILE]
  if (file) return { kind: 'file', path: file, requireLedger }

  const token = env[LEDGER_ENV.TOKEN]
  const ref = env[LEDGER_ENV.REF]
  if (token && ref) return { kind: 'api', token, ref, requireLedger }
  if (token || ref) {
    return {
      kind: 'partial',
      present: token ? LEDGER_ENV.TOKEN : LEDGER_ENV.REF,
      missing: token ? LEDGER_ENV.REF : LEDGER_ENV.TOKEN,
      requireLedger,
    }
  }
  return { kind: 'none', requireLedger }
}

/**
 * Fetch the ledger payload. Read-only by construction: the only statement sent is LEDGER_QUERY,
 * which ledger-parity.test.ts asserts is a bare SELECT against schema_migrations.
 *
 * Every failure path here THROWS. There is deliberately no `catch { return [] }`: an empty ledger
 * is the one input that would sail through compare() looking like a clean run, which is why the
 * floor exists and why this must never manufacture one.
 */
export async function loadLedgerPayload(source, io = {}) {
  const readFile = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const doFetch = io.fetch ?? globalThis.fetch

  if (source.kind === 'file') return JSON.parse(readFile(source.path))

  if (typeof doFetch !== 'function') {
    throw new Error('no fetch implementation available to read the migration ledger')
  }
  const res = await doFetch(QUERY_URL(source.ref), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${source.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: LEDGER_QUERY }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `ledger query HTTP ${res.status} from the Supabase Management API. ${body.slice(0, 300)}`,
    )
  }
  return await res.json()
}

/** The loud skip. It states what DID pass, so nobody reads it as "the guard is broken", and what
 *  did NOT, so nobody reads it as "the database was checked". */
function skipLines(reason, total) {
  return [
    '',
    '⚠️  check:migrations — LEDGER COMPARISON SKIPPED. ' + reason,
    '',
    `    PROVED from the tree: ${total} migration(s), every version unique, every filename`,
    '      parseable, every menu reseed carrying its cache note.',
    '    NOT PROVED: that production has applied exactly these migrations and nothing else.',
    '      A repo file with no ledger row replays on a fresh environment; a ledger row with no',
    '      repo file is SQL production ran that the tree will never reproduce.',
    '',
    `    Arm it: export ${LEDGER_ENV.TOKEN} and ${LEDGER_ENV.REF}, or pass a pre-fetched`,
    `      payload with \`--ledger <file>\` (or ${LEDGER_ENV.FILE}). Add --require-ledger to make`,
    '      this skip a failure in an environment that is supposed to have a database.',
    '',
  ]
}

/**
 * Rule 4, end to end. Returns a status and the lines to print rather than printing itself, so the
 * tests can drive every branch — including the ones that must FAIL — without a live database.
 */
export async function ledgerCheck({ env = {}, argv = [], io = {}, total = 0 } = {}) {
  const source = resolveLedgerSource({ env, argv })

  if (source.kind === 'partial') {
    return {
      status: 'error',
      ok: false,
      lines: [
        '',
        `🔴 check:migrations — ledger comparison is HALF-ARMED: ${source.present} is set but ` +
          `${source.missing} is not.`,
        '',
        '    This is a failure and not a skip on purpose. Both vars set means "compare against',
        '    production"; neither set means "no database here, skip loudly". One set means a',
        '    guard someone armed has quietly stopped comparing anything, which is the exact',
        '    regression this rule exists to catch, wearing a different hat.',
        '',
        `    Set ${source.missing}, or unset ${source.present} to skip deliberately.`,
        '',
      ],
    }
  }

  if (source.kind === 'off') {
    if (source.requireLedger) {
      return {
        status: 'error',
        ok: false,
        lines: ['', '🔴 check:migrations — --no-ledger and --require-ledger are contradictory.', ''],
      }
    }
    return { status: 'skipped', ok: true, lines: skipLines('Disabled with --no-ledger.', total) }
  }

  if (source.kind === 'none') {
    if (source.requireLedger) {
      return {
        status: 'error',
        ok: false,
        lines: [
          '',
          '🔴 check:migrations — --require-ledger was passed and no ledger source is configured.',
          '',
          `    Set ${LEDGER_ENV.TOKEN} + ${LEDGER_ENV.REF}, or pass --ledger <file>.`,
          '',
        ],
      }
    }
    return {
      status: 'skipped',
      ok: true,
      lines: skipLines(
        `No database reachable (${LEDGER_ENV.TOKEN} + ${LEDGER_ENV.REF} are unset). This is the ` +
          'normal state in CI.',
        total,
      ),
    }
  }

  let result
  let malformed = []
  try {
    const payload = await loadLedgerPayload(source, io)
    const ledger = parseLedger(payload)
    const repo = repoRows(io.repo ?? {})
    malformed = repo.malformed
    result = compare(repo.rows, ledger)
  } catch (e) {
    return {
      status: 'error',
      ok: false,
      lines: [
        '',
        `🔴 check:migrations — the ledger comparison could not RUN: ${e instanceof Error ? e.message : String(e)}`,
        '',
        '    A read that failed is not a read that agreed. This exits 1 rather than degrading to',
        '    a skip, because a guard that answers "fine" when it could not look is the failure',
        '    mode the whole rule is here to prevent.',
        '',
      ],
    }
  }

  const report = formatReport(result, { malformed })
  return result.inParity
    ? { status: 'parity', ok: true, lines: ['', report], result }
    : { status: 'drift', ok: false, lines: ['', report], result }
}

async function main() {
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

    // Rule 4 runs only once the TREE is sound. Comparing a corpus that already has a collision or
    // a malformed name against the ledger reports the same defect twice under two names, and the
    // filename fix has to land first anyway.
    const ledger = await ledgerCheck({ env: process.env, argv: process.argv.slice(2), total })
    for (const line of ledger.lines) (ledger.ok ? console.log : console.error)(line)
    if (!ledger.ok) process.exit(1)
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    // An unexpected throw is a FAILED CHECK, never a quiet exit 0. Node would otherwise reject the
    // promise and, depending on flags, still leave a zero status behind — a green guard that never
    // ran, which is the one outcome this file must not be able to produce.
    console.error(`🔴 check:migrations crashed: ${e instanceof Error ? e.stack : String(e)}`)
    process.exit(1)
  })
}
