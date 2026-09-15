import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CRITICAL_AT,
  OWNER,
  USAGE_QUERY,
  WARN_AT,
  duration,
  indeterminate,
  parseUsage,
  perMinute,
  report,
  tier,
} from './db-usage.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LIVE-336 — the database account can be exhausted by the loop, and nothing noticed.
//
// The 2026-09-15 outage was invisible because the signal an operator reaches for first (the
// control plane's project status) read ACTIVE_HEALTHY while every query failed. So the thing this
// suite has to prove is NOT mainly that the arithmetic is right. It is that the instrument
// refuses to say "fine" when it could not look — the same defect, one layer up.
//
// Every arm is driven against a real or deliberately broken payload rather than assumed to fire,
// the discipline types-drift.test.ts applies to its detector.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..', '..')

/** The real 2026-09-15 06:23Z reading of the live project, as the Management API returned it.
 *  Kept verbatim: a fixture invented to suit the parser proves the parser suits itself. */
const LIVE = [
  {
    usage: {
      maxConnections: 90,
      connections: 45,
      clientBackends: 37,
      dbBytes: 175090835,
      transactions: 962166,
      rowsRead: 25828237,
      statsSince: '2026-09-15T04:41:02.288178+00:00',
      statsResetSeen: false,
      windowSeconds: 6098,
    },
  },
]

const at = (connections: number) => [{ usage: { ...LIVE[0].usage, connections } }]

describe('the reading it actually took', () => {
  it('parses the live payload and states the one real ceiling as a share', () => {
    const r = parseUsage(LIVE)!
    expect(r.connections).toBe(45)
    expect(r.maxConnections).toBe(90)
    const out = report(r)
    expect(out.code).toBe(0)
    expect(out.tier).toBe('ok')
    expect(out.text).toContain('45 of 90 (50%)')
    expect(out.text).toContain('37 of them client backends')
  })

  it('states the window and derives a per-minute rate from it', () => {
    const out = report(parseUsage(LIVE)!)
    // 962,166 transactions over 6,098 s is ~9,467/min — the loop's own load, and the figure the
    // row exists to make visible.
    expect(out.text).toContain('~9,467/min')
    expect(out.text).toContain('1h 42m')
    expect(out.text).toContain('2026-09-15T04:41:02.288178+00:00')
  })

  it('🔴 says WHICH anchor the window came from, because stats_reset is null on this project', () => {
    expect(report(parseUsage(LIVE)!).text).toContain('postmaster start (stats never reset)')
    const reset = [{ usage: { ...LIVE[0].usage, statsResetSeen: true } }]
    expect(report(parseUsage(reset)!).text).toContain('the last stats reset')
  })

  it('names an owner in the report itself', () => {
    expect(report(parseUsage(LIVE)!).text).toContain(OWNER)
    expect(indeterminate('x').text).toContain(OWNER)
  })

  it('gives volume and size NO percentage — there is no readable denominator for either', () => {
    const out = report(parseUsage(LIVE)!)
    expect(out.text).toContain('167.0 MiB')
    // The only percentage anywhere in a green reading is the connection share.
    expect(out.text.match(/\d+%/g)).toEqual(['50%'])
  })
})

describe('the tiers fire, and they are a routing signal rather than a failure', () => {
  it('holds at ok below the warn threshold and crosses exactly at it', () => {
    expect(tier(parseUsage(at(Math.floor(90 * WARN_AT) - 1))!)).toBe('ok')
    expect(tier(parseUsage(at(Math.ceil(90 * WARN_AT)))!)).toBe('warn')
  })

  it('reaches critical at the critical threshold', () => {
    expect(tier(parseUsage(at(Math.ceil(90 * CRITICAL_AT)))!)).toBe('critical')
    const out = report(parseUsage(at(88))!)
    expect(out.code).toBe(1)
    expect(out.text).toContain('AT OR OVER 90%')
  })

  it('a non-green tier exits 1 so the sweep routes it to the issue, never 79 or 2', () => {
    expect(report(parseUsage(at(70))!).code).toBe(1)
    expect(report(parseUsage(at(88))!).code).toBe(1)
  })
})

describe('🔴 it never reports "could not look" as "the ceiling is fine"', () => {
  // This is the whole row. Each of these is a real shape the Management API can return, and not
  // one of them may come back as a verdict.
  it.each([
    ['an error envelope', { message: 'Failed to run sql query: remaining connection slots' }],
    ['an empty result', []],
    ['an empty object', {}],
    ['a row with no reading', [{}]],
    ['a row missing max_connections', [{ usage: { connections: 45 } }]],
    ['a row missing the connection count', [{ usage: { maxConnections: 90 } }]],
    ['a nonsense max_connections', [{ usage: { maxConnections: 0, connections: 45 } }]],
  ])('parses %s to null rather than to a reading', (_label, payload) => {
    expect(parseUsage(payload)).toBeNull()
  })

  it('the indeterminate report says so in words and exits 79', () => {
    const r = indeterminate('the token is absent')
    expect(r.code).toBe(79)
    expect(r.tier).toBe('indeterminate')
    expect(r.text).toContain('Could not look')
    expect(r.text).toContain('nothing here says it has headroom')
    // A positive control on the negative: the words a green reading uses must NOT appear.
    expect(r.text).not.toContain('✅')
    expect(r.text).not.toContain('Headroom.')
  })
})

describe('the parser is forgiving about transport, strict about meaning', () => {
  it('accepts the raw string body, the {result} envelope and a bare array alike', () => {
    for (const p of [JSON.stringify(LIVE), { result: LIVE }, { rows: LIVE }, LIVE])
      expect(parseUsage(p)?.connections).toBe(45)
  })

  it('accepts numeric strings, which is how postgres returns bigint through json', () => {
    const asText = [{ usage: { ...LIVE[0].usage, maxConnections: '90', connections: '45', transactions: '962166' } }]
    const r = parseUsage(asText)!
    expect(r.maxConnections).toBe(90)
    expect(r.transactions).toBe(962166)
  })

  it('leaves the optional figures null rather than guessing them', () => {
    const r = parseUsage([{ usage: { maxConnections: 90, connections: 45 } }])!
    expect(r.dbBytes).toBeNull()
    expect(r.windowSeconds).toBeNull()
    expect(report(r).text).toContain('? transactions')
  })

  it('refuses to invent a rate when there is no window to divide by', () => {
    expect(perMinute(100, null)).toBeNull()
    expect(perMinute(100, 0)).toBeNull()
    expect(perMinute(null, 60)).toBeNull()
    expect(perMinute(600, 60)).toBe(600)
    expect(duration(null)).toBe('an unknown window')
    expect(duration(90)).toBe('2m')
    expect(duration(6098)).toBe('1h 42m')
  })
})

describe('the query measures what the report claims it measures', () => {
  it('reads the connection ceiling, the activity table and the cumulative counters', () => {
    for (const t of [
      'max_connections',
      'pg_stat_activity',
      'pg_stat_database',
      'pg_database_size',
      'xact_commit',
      'tup_returned',
    ])
      expect(USAGE_QUERY).toContain(t)
  })

  it('🔴 anchors the window, or every rate it prints is meaningless', () => {
    expect(USAGE_QUERY).toContain('coalesce(d.stats_reset, pg_postmaster_start_time())')
  })

  it('is READ ONLY — a maintenance reading may never write', () => {
    expect(USAGE_QUERY).toMatch(/^select/i)
    expect(USAGE_QUERY.toLowerCase()).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant)\b/)
  })
})

describe('the workflow wires it, and the skip arm does not claim a verdict', () => {
  const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'maintenance.yml'), 'utf8')
  // The step's OWN body, cut at the next step in the job, so none of these assertions can be
  // satisfied by a neighbour that happens to do the right thing.
  const from = yml.indexOf('- name: Database account usage')
  const next = yml.indexOf('\n      - name:', from + 1)
  const step = yml.slice(from, next === -1 ? undefined : next)

  it('exists as its own step', () => {
    expect(from).toBeGreaterThan(-1)
  })

  it('runs the script and posts the report to the run summary', () => {
    expect(step).toContain('scripts/maintenance/db-usage.mjs --print-query')
    expect(step).toContain('node scripts/maintenance/db-usage.mjs usage.json')
    expect(step).toContain('GITHUB_STEP_SUMMARY')
  })

  it('🔴 the un-armed arm says the ceiling was NOT read, never that it is fine', () => {
    const skip = step.slice(step.indexOf('SUPABASE_ACCESS_TOKEN" ]'), step.indexOf('exit 0'))
    expect(skip).toMatch(/not read|could not/i)
    expect(skip).not.toContain('✅')
  })

  it('never fails the sweep: the step runs under set +e and the issue condition reads its code', () => {
    expect(step.slice(0, step.indexOf('exit 0'))).toContain('set +e')
    expect(yml).toContain("steps.dbusage.outputs.code != '0'")
  })

  it('🔴 the un-armed arm writes dbusage.txt too, so code 79 does not open an empty issue', () => {
    // Its siblings skip quietly and write nothing. This one cannot: 79 already satisfies the
    // tracking-issue condition, so with no file the issue would carry a notice with no notice in it.
    expect(step.slice(0, step.indexOf('exit 0'))).toContain('> dbusage.txt')
    expect(yml).toContain("read('dbusage.txt')")
  })
})
