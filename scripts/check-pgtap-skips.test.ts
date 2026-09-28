// Non-triviality tests for the pgTAP permanent-skip gate (HYG-122).
//
// The gate exists because a skip nobody read counted as coverage for weeks. So these drive its
// parser against pg_prove's real output shape (captured from db-tests run 36450365753, timestamps
// included) and its verdict against every arm: an unstated skip fails, a stated one warns, a
// stated one that stopped skipping fails, an entry for a file that is not in the suite fails, and
// a log too short to be this suite's fails.

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MIN_FILES, UNCOVERED_LIST, isSkipping, main, parseTap, parseUncovered, verdict } from './check-pgtap-skips.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const PREFIX = '/home/runner/work/frequency-web/frequency-web/supabase/tests/'

/** pg_prove's default output for `n` passing files, with `skips` files printing a SKIPPING diag. */
function tap(n: number, skips: string[] = [], stamped = true): string {
  const lines: string[] = []
  const stamp = (s: string) => (stamped ? `2026-09-28T16:23:22.3075751Z ${s}` : s)
  for (let i = 0; i < n; i += 1) {
    const name = `file_${String(i).padStart(2, '0')}.test.sql`
    if (skips.includes(name)) {
      lines.push(stamp(`${PREFIX}${name} ... `))
      lines.push(stamp(`# SKIPPING: safeupdate could not be loaded in this database (42501: access to library "safeupdate" is not allowed). The ADR-1207 regression is NOT covered by this run.`))
      lines.push(stamp('ok'))
    } else {
      lines.push(stamp(`${PREFIX}${name} ............................ ok`))
    }
  }
  lines.push(stamp('All tests successful.'))
  lines.push(stamp(`Files=${n}, Tests=547,  4 wallclock secs`))
  lines.push(stamp('Result: PASS'))
  return lines.join('\n') + '\n'
}

describe('parseTap', () => {
  it('reads one entry per file, its verdict, and the diag lines between file and verdict', () => {
    const files = parseTap(tap(3, ['file_01.test.sql']))
    expect(files.map((f) => f.file)).toEqual(['file_00.test.sql', 'file_01.test.sql', 'file_02.test.sql'])
    expect(files.map((f) => f.verdict)).toEqual(['ok', 'ok', 'ok'])
    expect(files[1].diags[0]).toMatch(/^SKIPPING: safeupdate/)
    expect(isSkipping(files[1])).toBe(true)
    expect(isSkipping(files[0])).toBe(false)
  })

  it('reads the same output without the Actions timestamp prefix', () => {
    const files = parseTap(tap(2, ['file_00.test.sql'], false))
    expect(files).toHaveLength(2)
    expect(isSkipping(files[0])).toBe(true)
  })

  it('reads the real run\'s exact lines for the safeupdate file', () => {
    const real = [
      '2026-09-28T16:23:22.3075751Z /home/runner/work/frequency-web/frequency-web/supabase/tests/refresh_resonance_density_cells_safeupdate.test.sql ... ',
      '2026-09-28T16:23:22.3077371Z # SKIPPING: safeupdate could not be loaded in this database (42501: access to library "safeupdate" is not allowed). The ADR-1207 regression is NOT covered by this run.',
      '2026-09-28T16:23:22.3078164Z ok',
      '2026-09-28T16:23:22.3291839Z /home/runner/work/frequency-web/frequency-web/supabase/tests/remaining_permissive_policies.test.sql ................ ok',
    ].join('\n')
    const files = parseTap(real)
    expect(files.map((f) => [f.file, f.verdict, isSkipping(f)])).toEqual([
      ['refresh_resonance_density_cells_safeupdate.test.sql', 'ok', true],
      ['remaining_permissive_policies.test.sql', 'ok', false],
    ])
  })

  it('a diag that merely mentions skipping in prose is not a skip', () => {
    const files = parseTap(`${PREFIX}a.test.sql ... \n# this file used to skip; it does not now\nok\n`)
    expect(isSkipping(files[0])).toBe(false)
  })
})

describe('parseUncovered', () => {
  it('reads file and reason, ignoring comments, and refuses a line with no reason', () => {
    const m = parseUncovered('# c\n\nx.test.sql because of y\n')
    expect(m.get('x.test.sql')).toBe('because of y')
    expect(() => parseUncovered('bare.test.sql\n')).toThrow(/needs/)
  })

  it('the real list has a reason on every line and names only files that exist', () => {
    const m = parseUncovered(readFileSync(path.join(ROOT, UNCOVERED_LIST), 'utf8'))
    for (const [file, reason] of m) {
      expect(reason.length).toBeGreaterThan(40)
      expect(() => readFileSync(path.join(ROOT, 'supabase/tests', file))).not.toThrow()
    }
  })
})

describe('verdict, arm by arm', () => {
  const list = new Map([['file_01.test.sql', 'stated']])
  it('passes a suite whose only skip is stated, and reports it', () => {
    const v = verdict({ files: parseTap(tap(25, ['file_01.test.sql'])), uncovered: list })
    expect(v.ok).toBe(true)
    expect(v.stated.map((f) => f.file)).toEqual(['file_01.test.sql'])
  })
  it('FAILS an unstated skip', () => {
    const v = verdict({ files: parseTap(tap(25, ['file_01.test.sql', 'file_07.test.sql'])), uncovered: list })
    expect(v.ok).toBe(false)
    expect(v.unstated.map((f) => f.file)).toEqual(['file_07.test.sql'])
  })
  it('FAILS a stated entry whose file stopped skipping', () => {
    const v = verdict({ files: parseTap(tap(25, [])), uncovered: list })
    expect(v.ok).toBe(false)
    expect(v.stale).toEqual(['file_01.test.sql'])
  })
  it('FAILS a stated entry for a file the suite does not contain', () => {
    const v = verdict({ files: parseTap(tap(25, [])), uncovered: new Map([['gone.test.sql', 'x']]) })
    expect(v.ok).toBe(false)
    expect(v.absent).toEqual(['gone.test.sql'])
  })
  it('refuses a log with too few files to be this suite', () => {
    const v = verdict({ files: parseTap(tap(3, [])), uncovered: new Map() })
    expect(v.ok).toBe(false)
    expect(v.files).toBeLessThan(MIN_FILES)
  })
})

const temps: string[] = []
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true })
})

describe('main(): exit codes against the real list', () => {
  function logFile(text: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'pgtap-skips-'))
    temps.push(dir)
    const p = path.join(dir, 'pgtap.log')
    writeFileSync(p, text)
    return p
  }
  const REAL = 'refresh_resonance_density_cells_safeupdate.test.sql'
  const suite = (skips: string[]) => {
    // 29 ordinary files plus the real safeupdate file, in pg_prove's shape.
    const t = tap(29, skips.filter((s) => s !== REAL))
    const realBlock = skips.includes(REAL)
      ? `${PREFIX}${REAL} ... \n# SKIPPING: safeupdate could not be loaded in this database (42501). NOT covered.\nok\n`
      : `${PREFIX}${REAL} ... ok\n`
    return t.replace('All tests successful.', `${realBlock}All tests successful.`)
  }

  it('exits 0 on the suite as CI prints it today (the safeupdate file skipping, stated), with a summary warning', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pgtap-skips-sum-'))
    temps.push(dir)
    const summary = path.join(dir, 'summary.md')
    const code = main([logFile(suite([REAL]))], { GITHUB_STEP_SUMMARY: summary })
    expect(code).toBe(0)
    expect(readFileSync(summary, 'utf8')).toContain('COVERAGE ABSENT')
  })

  it('exits 1 when another file starts skipping without being stated', () => {
    expect(main([logFile(suite([REAL, 'file_03.test.sql']))], {})).toBe(1)
  })

  it('exits 1 the day the safeupdate file stops skipping while still listed', () => {
    expect(main([logFile(suite([]))], {})).toBe(1)
  })

  it('exits 1 with no log, an unreadable log, or a log that is not the suite', () => {
    expect(main([], {})).toBe(1)
    expect(main([path.join(tmpdir(), 'does-not-exist.log')], {})).toBe(1)
    expect(main([logFile('nothing here\n')], {})).toBe(1)
  })
})
