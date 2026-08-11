#!/usr/bin/env node
// ledger-parity — the repo's migration FILENAMES and production's applied LEDGER must be the same
// set, on both columns.
//
// WHY THIS EXISTS. `check:migrations` validates the SHAPE of the filenames (14 digits, unique,
// parseable). It cannot know whether the database agrees, because CI has no database credentials.
// That blind spot has now produced the same defect FOUR times, and the mechanism is exact:
//
//   Applying a migration through the Supabase MCP `apply_migration` tool stamps the ledger row with
//   APPLY-TIME WALL CLOCK and ignores the version prefix in the filename. So a file named
//   `20270220000000_fk_indexes_and_billing_policy_merge.sql` landed in the ledger as version
//   `20260811003019`. Every other migration in this repo reached production by a path that
//   preserved the filename version.
//
// That is why the drift always looks the same: exactly ONE orphaned PAIR. One ledger version with
// no repo file, one repo file with no ledger row, and the two share a `name`. Nothing errors.
// `check:migrations` stays green. The next `supabase db push` sees an unapplied version and tries
// to re-run a migration that already ran, and a fresh environment (local dev, a preview branch, a
// disaster-recovery rebuild) replays a different sequence than production ever ran.
//
// So this gate reports the PAIR, not just the two halves, because the pairing IS the signature of
// this defect and it names the one-line repair instead of making the operator derive it.
//
// WHERE IT RUNS. The scheduled maintenance sweep, NOT the CI guard array. CI has no database
// credentials (see the guard-array comment block in .github/workflows/ci.yml), and this check is
// meaningless without them. It follows scripts/maintenance/advisor-diff.mjs exactly: the fetch is a
// separate, token-gated CI step (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF) and this script
// consumes its JSON output. No DB access here, so it stays a pure function of two inputs and is
// testable without a live database.
//
// VERIFIED PARITY, 2026-08-11. 598 repo files, 598 ledger rows, byte-identical on both columns:
//   versions  md5 = 57b474003aa9be6bb254555815acae03
//   version+name  = 10c840b64034164cd23627ef51dfdcf2
// Both reproduce from the filenames alone, which is what makes exact parity the correct target
// rather than an approximation.
//
// Usage:
//   node scripts/maintenance/ledger-parity.mjs --print-query   # emit the SQL for the fetch step
//   pnpm maintenance:ledger-parity <ledger.json>               # compare, report, exit 1 on drift
//
// The npm script is `maintenance:` and not `check:` ON PURPOSE. The ci.yml guard loop runs
// `pnpm "check:${guard}"`, so a `check:`-named script is one array edit away from being run in a
// job with no credentials, where its only possible outcomes are a crash or a vacuous pass. The
// name makes the wrong home unreachable rather than merely discouraged.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const DIR = join('supabase', 'migrations')

/** The same shape `supabase db push` parses, and the same regex as check-migrations.mjs. */
const FILENAME = /^(\d{14})_([A-Za-z0-9_.-]+)\.sql$/

/**
 * The ledger read. Deliberately a plain SELECT and nothing else: this instrument is READ-ONLY
 * against production, and the repair it recommends is for a human to run knowingly.
 *
 * `coalesce(name, '')` so a null name reads as a name difference rather than vanishing from the
 * comparison. (No nulls existed on 2026-08-11; this is so a future one cannot hide.)
 */
export const LEDGER_QUERY =
  "select version, coalesce(name, '') as name from supabase_migrations.schema_migrations order by version"

/**
 * A gate that scans nothing reports a clean bill of health. Two sets that are both empty are
 * trivially identical, so without this floor a broken readdir or a fetch that returned `[]` would
 * print perfect parity and exit 0. That is this repo's named failure mode (check-templates.mjs
 * MIN_PAGES, check-gate-parity.mjs MIN_ROWS), and it applies with more force here because BOTH
 * sides can fail independently.
 *
 * 400, measured against 598 on 2026-08-11 (598 repo .sql files, 598 ledger rows). That is ~33%
 * headroom, which is real: it survives a large deliberate squash of old migrations while still
 * catching a read that silently collapses. Same value as check-migrations.mjs MIN_MIGRATIONS,
 * check:grants and check:rls, which floor the same directory, so the repo has one number to move.
 */
export const MIN_ROWS = 400

/** Sort by version as TEXT, matching the ledger's `order by version` (a text column). */
const byVersion = (a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0)

/**
 * The repo side: every `<14-digit>_<name>.sql` under supabase/migrations, as the ledger would
 * record it. A malformed filename is NOT this gate's job (check:migrations fails on it and names
 * it); it is returned separately so a broken name cannot silently shrink this corpus either.
 */
export function repoRows(io = {}) {
  const list = io.readdir ? io.readdir(DIR) : readdirSync(DIR)
  const rows = []
  const malformed = []
  for (const f of list) {
    if (!f.endsWith('.sql')) continue
    const m = FILENAME.exec(f)
    if (!m) {
      malformed.push(f)
      continue
    }
    rows.push({ version: m[1], name: m[2] })
  }
  return { rows: rows.sort(byVersion), malformed }
}

/**
 * The ledger side, however the Management API spells it. Same defensive posture as
 * advisor-diff.mjs `findLints`: the payload has been seen bare and wrapped, and a query error
 * comes back as an object rather than an array. An error must THROW rather than parse as an empty
 * corpus, because an empty corpus is the one input that would otherwise look like a clean run.
 */
export function parseLedger(payload) {
  const rowsOf = (v) => {
    if (Array.isArray(v)) return v.every((r) => r && typeof r === 'object' && 'version' in r) ? v : null
    return null
  }
  const direct = rowsOf(payload)
  if (direct) return normalizeLedger(direct)
  if (payload && typeof payload === 'object') {
    if (payload.error || payload.message) {
      throw new Error(`ledger query failed: ${JSON.stringify(payload.error ?? payload.message)}`)
    }
    for (const v of Object.values(payload)) {
      const found = rowsOf(v)
      if (found) return normalizeLedger(found)
    }
  }
  throw new Error(
    'ledger payload contained no rows with a `version` column. Expected the Management API ' +
      '`POST /v1/projects/{ref}/database/query` response for LEDGER_QUERY.',
  )
}

function normalizeLedger(rows) {
  return rows
    .map((r) => ({ version: String(r.version), name: r.name == null ? '' : String(r.name) }))
    .sort(byVersion)
}

/** md5 of `string_agg(version, E'\n' order by version)` — identical bytes, so it reproduces the
 *  value Postgres computes and a human can compare the two sides in one line. */
export const versionsMd5 = (rows) => md5(rows.map((r) => r.version).join('\n'))

/** md5 of `string_agg(version || E'\t' || name, E'\n' order by version)`. */
export const pairsMd5 = (rows) => md5(rows.map((r) => `${r.version}\t${r.name}`).join('\n'))

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')

/**
 * Compare the two sets on BOTH columns.
 *
 * Throws on a corpus below MIN_ROWS rather than returning parity: see MIN_ROWS.
 */
export function compare(repo, ledger, { min = MIN_ROWS } = {}) {
  if (repo.length < min || ledger.length < min) {
    throw new Error(
      `ledger-parity read ${repo.length} repo file(s) and ${ledger.length} ledger row(s), ` +
        `expected at least ${min} on each side. Two empty sets are trivially identical, so this ` +
        'is a broken read rather than a clean run. Check the readdir and the query response ' +
        'before believing any parity number.',
    )
  }

  const repoBy = new Map(repo.map((r) => [r.version, r]))
  const ledgerBy = new Map(ledger.map((r) => [r.version, r]))

  const repoOnly = repo.filter((r) => !ledgerBy.has(r.version))
  const ledgerOnly = ledger.filter((r) => !repoBy.has(r.version))

  const nameMismatches = []
  for (const r of repo) {
    const l = ledgerBy.get(r.version)
    if (l && l.name !== r.name) nameMismatches.push({ version: r.version, repo: r.name, ledger: l.name })
  }

  // THE SIGNATURE. A repo orphan and a ledger orphan sharing a `name` are the same migration
  // recorded under a wall-clock version. Pair them and consume both, so the leftovers are the
  // genuinely one-sided cases (authored but never applied / applied from outside the repo).
  const pending = new Map()
  for (const l of ledgerOnly) {
    if (!pending.has(l.name)) pending.set(l.name, [])
    pending.get(l.name).push(l)
  }
  const paired = new Set()
  const pairs = []
  const unpairedRepo = []
  for (const r of repoOnly) {
    const queue = pending.get(r.name)
    if (queue && queue.length) {
      const l = queue.shift()
      paired.add(l)
      pairs.push({ name: r.name, repoVersion: r.version, ledgerVersion: l.version })
      continue
    }
    unpairedRepo.push(r)
  }
  const unpairedLedger = ledgerOnly.filter((l) => !paired.has(l))

  return {
    repoCount: repo.length,
    ledgerCount: ledger.length,
    repoOnly,
    ledgerOnly,
    pairs,
    unpairedRepo,
    unpairedLedger,
    nameMismatches,
    md5: {
      repoVersions: versionsMd5(repo),
      ledgerVersions: versionsMd5(ledger),
      repoPairs: pairsMd5(repo),
      ledgerPairs: pairsMd5(ledger),
    },
    inParity:
      repoOnly.length === 0 && ledgerOnly.length === 0 && nameMismatches.length === 0,
  }
}

/** A short Markdown report for the step summary, the tracking issue, or the CI log. */
export function formatReport(r, { malformed = [] } = {}) {
  const lines = []
  if (r.inParity) {
    lines.push(
      `✅ Migration ledger parity: ${r.repoCount} repo file(s) ⇄ ${r.ledgerCount} applied row(s), ` +
        'identical on version and name.',
    )
    lines.push(`   versions md5 \`${r.md5.repoVersions}\` · version+name md5 \`${r.md5.repoPairs}\``)
    if (malformed.length) {
      lines.push('', `⚠️ ${malformed.length} filename(s) did not parse and were not compared (see \`pnpm check:migrations\`):`)
      for (const f of malformed) lines.push(`- \`${f}\``)
    }
    return lines.join('\n')
  }

  lines.push(
    `🔴 Migration ledger DRIFT: ${r.repoCount} repo file(s) vs ${r.ledgerCount} applied row(s).`,
    '',
    '| side | count | versions md5 | version+name md5 |',
    '| --- | --- | --- | --- |',
    `| repo | ${r.repoCount} | \`${r.md5.repoVersions}\` | \`${r.md5.repoPairs}\` |`,
    `| ledger | ${r.ledgerCount} | \`${r.md5.ledgerVersions}\` | \`${r.md5.ledgerPairs}\` |`,
    '',
  )

  if (r.pairs.length) {
    lines.push(
      `🔴 ${r.pairs.length} ORPHAN PAIR(S): one migration recorded under two versions.`,
      '',
      'This is the wall-clock signature: `apply_migration` stamped the ledger with apply time and',
      'ignored the filename version. The file and the row are the SAME migration.',
      '',
    )
    for (const p of r.pairs) {
      lines.push(`- \`${p.name}\``)
      lines.push(`  - repo file: \`${p.repoVersion}_${p.name}.sql\``)
      lines.push(`  - ledger row: version \`${p.ledgerVersion}\` (apply-time stamp)`)
      lines.push(
        '  - repair (one statement, run it knowingly against production):' +
          `\n    \`\`\`sql\n    update supabase_migrations.schema_migrations\n` +
          `       set version = '${p.repoVersion}'\n     where version = '${p.ledgerVersion}';\n    \`\`\``,
      )
    }
    lines.push('')
  }

  if (r.unpairedRepo.length) {
    lines.push(`⚠️ ${r.unpairedRepo.length} migration(s) authored but NEVER APPLIED (repo file, no ledger row):`, '')
    for (const x of r.unpairedRepo) lines.push(`- \`${x.version}_${x.name}.sql\``)
    lines.push('', '  Either apply them, or explain why they are in the tree unapplied.', '')
  }

  if (r.unpairedLedger.length) {
    lines.push(`⚠️ ${r.unpairedLedger.length} applied migration(s) the repo DOES NOT RECORD (ledger row, no repo file):`, '')
    for (const x of r.unpairedLedger) lines.push(`- version \`${x.version}\`, name \`${x.name}\``)
    lines.push(
      '',
      '  Production ran SQL that is not in the tree, so a fresh environment will never reproduce it.',
      '  Recover the SQL (the ledger keeps `statements`) and commit it under its own version.',
      '',
    )
  }

  if (r.nameMismatches.length) {
    lines.push(`⚠️ ${r.nameMismatches.length} version(s) applied under a DIFFERENT NAME:`, '')
    for (const m of r.nameMismatches) lines.push(`- \`${m.version}\`: repo \`${m.repo}\`, ledger \`${m.ledger}\``)
    lines.push('', '  The version matched so nothing will re-run, but the two sides disagree about', '  which migration that version IS. Rename the file, or correct the ledger row.', '')
  }

  if (malformed.length) {
    lines.push(`⚠️ ${malformed.length} filename(s) did not parse and were not compared (see \`pnpm check:migrations\`):`, '')
    for (const f of malformed) lines.push(`- \`${f}\``)
    lines.push('')
  }

  lines.push('_See docs/DATABASE.md. Do NOT close this by renaming a file to match the ledger stamp: the filename version is the one the repo sorts and replays by._')
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--print-query') {
    console.log(LEDGER_QUERY)
    return
  }
  const file = args[0]
  if (!file) {
    console.error('usage: ledger-parity.mjs <ledger.json>   |   ledger-parity.mjs --print-query')
    process.exit(2)
  }
  const { rows, malformed } = repoRows()
  const ledger = parseLedger(JSON.parse(readFileSync(file, 'utf8')))
  const result = compare(rows, ledger)
  console.log(formatReport(result, { malformed }))
  if (!result.inParity) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (e) {
    // A floor breach or an unparseable payload is a FAILURE, not a quiet skip. The whole point of
    // this instrument is that silence must mean "checked and identical".
    console.error(`🔴 ledger-parity could not run: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}
