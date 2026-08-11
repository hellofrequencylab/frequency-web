import { describe, it, expect } from 'vitest'
import {
  compare,
  formatReport,
  parseLedger,
  repoRows,
  versionsDigest,
  pairsDigest,
  LEDGER_QUERY,
  MIN_ROWS,
} from './ledger-parity.mjs'

// Self-test for the migration ledger parity check. The defect it exists for has recurred FOUR
// times and always looks identical: `apply_migration` stamps the ledger with APPLY-TIME wall clock
// and ignores the filename's version prefix, so one repo file and one ledger row describe the same
// migration under two versions. These tests pin that the pairing is DETECTED and REPORTED AS A
// PAIR, because the two halves reported separately read as two unrelated problems.
//
// No live database: every case drives the io seam (a filename list, a parsed query payload).

const row = (version: string, name: string) => ({ version, name })

/** A plausible corpus, well above MIN_ROWS, so the floor never fires on the parity cases. */
function corpus(n = MIN_ROWS + 50) {
  const rows: Array<{ version: string; name: string }> = []
  for (let i = 0; i < n; i++) {
    rows.push(row(String(20250101000000 + i * 100), `migration_${i}`))
  }
  return rows
}

const files = (rows: Array<{ version: string; name: string }>) => rows.map((r) => `${r.version}_${r.name}.sql`)

describe('exact parity is the target state, and it passes', () => {
  it('identical sets report parity on both columns', () => {
    const rows = corpus()
    const r = compare(rows, [...rows])
    expect(r.inParity).toBe(true)
    expect(r.repoOnly).toEqual([])
    expect(r.ledgerOnly).toEqual([])
    expect(r.nameMismatches).toEqual([])
    expect(r.digest.repoVersions).toBe(r.digest.ledgerVersions)
    expect(r.digest.repoPairs).toBe(r.digest.ledgerPairs)
    expect(formatReport(r)).toContain('✅')
  })

  it('the digests reproduce what Postgres computes for string_agg', () => {
    // sha256 of the same bytes, so the number in the report is directly comparable to a hand-run
    // `encode(sha256(convert_to(string_agg(version, E'\n' order by version),'UTF8')),'hex')` against production. Pinned against the
    // live values measured 2026-08-11, which the repo filenames alone reproduce.
    const { rows } = repoRows()
    expect(rows.length).toBe(598)
    expect(versionsDigest(rows)).toBe('0d4bf8158bbc53a972a760f7c9d590bd3193d848a2146bde37d3c92ff6411818')
    expect(pairsDigest(rows)).toBe('c9f8be0151783b08a20e0451e79f49f01df0e6d986e1a9c8f21bfa9dedb64f19')
  })

  it('order is by version as text, so an unsorted ledger payload still matches', () => {
    const rows = corpus()
    const shuffled = [...rows].reverse()
    const r = compare(rows, shuffled)
    expect(r.inParity).toBe(true)
  })
})

describe('the wall-clock orphan pair, which is THE defect', () => {
  // The real one, 2026-08-11: a file named 20270220000000_… landed in the ledger as 20260811003019.
  const NAME = 'fk_indexes_and_billing_policy_merge'
  const base = corpus()
  const repo = [...base, row('20270220000000', NAME)]
  const ledger = [...base, row('20260811003019', NAME)]

  it('detects both halves', () => {
    const r = compare(repo, ledger)
    expect(r.inParity).toBe(false)
    expect(r.repoOnly.map((x) => x.version)).toEqual(['20270220000000'])
    expect(r.ledgerOnly.map((x) => x.version)).toEqual(['20260811003019'])
    // Counts stay equal on both sides, which is exactly why a count-only check misses this.
    expect(r.repoCount).toBe(r.ledgerCount)
  })

  it('reports them as ONE PAIR, not two unrelated orphans', () => {
    const r = compare(repo, ledger)
    expect(r.pairs).toEqual([
      { name: NAME, repoVersion: '20270220000000', ledgerVersion: '20260811003019' },
    ])
    expect(r.unpairedRepo).toEqual([])
    expect(r.unpairedLedger).toEqual([])
  })

  it('names the one-line repair rather than making the operator derive it', () => {
    const out = formatReport(compare(repo, ledger))
    expect(out).toContain('ORPHAN PAIR')
    expect(out).toContain("set version = '20270220000000'")
    expect(out).toContain("where version = '20260811003019'")
  })

  it('is detected end to end, from a filename list through to the report', () => {
    // The seam the real run uses: readdir on one side, a query payload on the other.
    const { rows } = repoRows({ readdir: () => files(repo) })
    const r = compare(rows, parseLedger({ result: ledger }))
    expect(r.pairs).toHaveLength(1)
    expect(r.pairs[0].name).toBe(NAME)
    expect(formatReport(r)).toContain('ORPHAN PAIR')
  })

  it('a genuinely one-sided orphan is NOT mispaired', () => {
    // Different names, so there is no pairing to claim. Reported as what they are: one authored
    // but never applied, one applied from somewhere the repo does not record.
    const r = compare(
      [...base, row('20270220000000', 'authored_never_applied')],
      [...base, row('20260811003019', 'applied_from_nowhere')],
    )
    expect(r.pairs).toEqual([])
    expect(r.unpairedRepo.map((x) => x.name)).toEqual(['authored_never_applied'])
    expect(r.unpairedLedger.map((x) => x.name)).toEqual(['applied_from_nowhere'])
    const out = formatReport(r)
    expect(out).toContain('authored but NEVER APPLIED')
    expect(out).toContain('the repo DOES NOT RECORD')
  })
})

describe('a name-only difference', () => {
  it('is caught even though the version sets are identical', () => {
    // Nothing will re-run (the version matched), so `db push` is silent about it. But the two
    // sides disagree about which migration that version IS, which is the same class of lie.
    const base = corpus()
    const repo = [...base, row('20270220000000', 'add_billing_policy')]
    const ledger = [...base, row('20270220000000', 'add_billing_policies')]
    const r = compare(repo, ledger)
    expect(r.inParity).toBe(false)
    expect(r.repoOnly).toEqual([])
    expect(r.ledgerOnly).toEqual([])
    expect(r.nameMismatches).toEqual([
      { version: '20270220000000', repo: 'add_billing_policy', ledger: 'add_billing_policies' },
    ])
    // The version digests agree; only the version+name digests diverge. That is the whole reason both
    // are reported.
    expect(r.digest.repoVersions).toBe(r.digest.ledgerVersions)
    expect(r.digest.repoPairs).not.toBe(r.digest.ledgerPairs)
    expect(formatReport(r)).toContain('applied under a DIFFERENT NAME')
  })
})

describe('the floor', () => {
  it('fires on an empty corpus rather than reporting parity', () => {
    // Two empty sets are trivially identical. Without the floor this is the input that prints a
    // perfect bill of health, which is this repo's named failure mode.
    expect(() => compare([], [])).toThrow(/broken read rather than a clean run/)
  })

  it('fires when only ONE side collapses', () => {
    const rows = corpus()
    expect(() => compare(rows, [])).toThrow(/expected at least/)
    expect(() => compare([], rows)).toThrow(/expected at least/)
  })

  it('sits under the live corpus with real headroom', () => {
    const { rows } = repoRows()
    expect(rows.length).toBeGreaterThan(MIN_ROWS)
    expect(MIN_ROWS).toBeGreaterThan(0)
  })

  it('the real repo tree passes its own floor', () => {
    const { rows, malformed } = repoRows()
    expect(malformed).toEqual([])
    expect(() => compare(rows, [...rows])).not.toThrow()
  })
})

describe('reading the repo side', () => {
  it('parses <14-digit>_<name>.sql and ignores non-sql entries', () => {
    const { rows, malformed } = repoRows({
      readdir: () => ['20260101000000_a.sql', 'README.md', 'fail-open-guards.test.ts'],
    })
    expect(rows).toEqual([row('20260101000000', 'a')])
    expect(malformed).toEqual([])
  })

  it('separates a malformed filename instead of dropping it silently', () => {
    // check:migrations owns the filename contract; this one only refuses to let a bad name shrink
    // the corpus without saying so.
    const { rows, malformed } = repoRows({ readdir: () => ['20260101000000_a.sql', 'oops.sql'] })
    expect(rows).toHaveLength(1)
    expect(malformed).toEqual(['oops.sql'])
  })
})

describe('reading the ledger side', () => {
  it('accepts a bare array of rows', () => {
    expect(parseLedger([{ version: '20260101000000', name: 'a' }])).toEqual([row('20260101000000', 'a')])
  })

  it('finds rows wrapped in a result envelope', () => {
    expect(parseLedger({ result: [{ version: '20260101000000', name: 'a' }] })).toEqual([
      row('20260101000000', 'a'),
    ])
  })

  it('coerces a null name to empty rather than dropping the row', () => {
    expect(parseLedger([{ version: '20260101000000', name: null }])).toEqual([row('20260101000000', '')])
  })

  it('THROWS on an API error payload instead of parsing it as an empty ledger', () => {
    // An empty ledger is the one input that would look like a clean run, so a failed fetch must
    // never reach compare().
    expect(() => parseLedger({ message: 'invalid access token' })).toThrow(/ledger query failed/)
    expect(() => parseLedger({ nothing: 'useful' })).toThrow(/no rows with a `version` column/)
  })

  it('the query is read-only', () => {
    expect(LEDGER_QUERY.trim().toLowerCase().startsWith('select ')).toBe(true)
    expect(LEDGER_QUERY).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i)
    expect(LEDGER_QUERY).toContain('supabase_migrations.schema_migrations')
  })
})
