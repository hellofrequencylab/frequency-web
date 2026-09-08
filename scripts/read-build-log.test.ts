import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  readBuildLog,
  parseLines,
  expectedGates,
  formatReading,
  formatBaseline,
  BASELINE,
  PAGE_DATA_SLOW_SECONDS,
} from './read-build-log.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE READER FOR LIVE-123 (ADR-1259).
//
// Every fixture below is a REAL excerpt, so the parser is pinned against text Vercel actually
// emitted rather than text this test invented:
//
//   · HEALTHY  — dpl_BegxDwyUawbFzjhvRMi4muyfBNXz, production 57a4adff8, 2026-09-08 00:11Z.
//   · STALLED  — the LIVE-123 capture 6kWwu78AzjQW2FZYe5yDYD2WYQ4W (PR #2309, c64daed09,
//                2026-08-25), whose header was re-read from Vercel on 2026-09-08 to record the
//                machine class the row never wrote down: cle1, 4 cores, 8 GB.
//   · OOM      — capture D, dpl_9dC94yezTttm78hzDKEeMeGRErm5 (#2326, 6bc8c5e3, 2026-09-01), the
//                one build that reached the "Build system report" because it DIED rather than hung.
//
// The controls matter as much as the fixtures. A log reader whose whole subject is SILENCE must be
// able to tell "nothing wrong" from "nothing read" — see the `unrecognised` cases.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const HEALTHY = `## Build Logs

00:11:02  Running build in Washington, D.C., USA (East) – iad1 (Enhanced Build Machine)
00:11:02  Build machine configuration: 8 cores, 16 GB
00:11:02  Cloning github.com/hellofrequencylab/frequency-web (Branch: main, Commit: 57a4adf)
00:11:09  Cloning completed: 6.769s
00:11:09  Restored build cache from previous deployment (HMpfD49ZoAu7RHYAUZqrYj1wHdb5)
00:11:17  Running "vercel build"
00:11:20  > next build
00:11:35  ✓ Compiled successfully in 13.6s
00:11:36  ✓ Completed runAfterProductionCompile in 387ms
00:11:36    Collecting page data using 7 workers ...
00:11:40    Generating static pages using 7 workers (0/254) ...
00:11:44  ✓ Generating static pages using 7 workers (254/254) in 4.0s
00:11:47  > frequency-web@0.1.0 postbuild /vercel/path0
00:11:48  ✅ check:build-budget — 6.12 GB across 458 functions, under the 8 GB budget.
00:11:48  ✅ check:og-trace — sharp ships to all 20 rasterising route(s), and to 64 other function(s) by segment inheritance (budget 100). 374 functions carry none of it.
00:11:49  ✅ check:cache-budget — Vercel will store about 1.23 GB packed (2.16 GiB raw: node_modules 934 MiB + .next/cache 1281 MiB), under the 1.5 GB ceiling.
00:11:49  ✅ check:shell-weight — the shell's eager first-load JS is 1027 KB across 22 chunks, under the 1400 KB budget.
00:11:50  ✅ check:build-fanout — the three fan-out lines from ADR-1002 are still closed.
00:11:51  Build Completed in /vercel/output [34s]
00:12:05  ▲ Build system report
00:12:05  • No memory or disk space problems detected
00:12:05  • Folder sizes on disk:
00:12:05    ‣ Input source code:   2706 MB
00:12:05    ‣ Build cache:           <1 MB
00:12:05    ‣ Output files:         310 MB
00:12:05    ‣ Node modules:         948 MB
00:12:21  Uploading build cache [1.23 GB]
`

const STALLED = `## Build Logs

21:53:24  Running build in Cleveland, USA (East) – cle1
21:53:24  Build machine configuration: 4 cores, 8 GB
21:56:11  Cloning completed: 2:46.962 (m:ss.mmm)
21:56:16  Running "vercel build"
21:57:44  ✓ Compiled successfully in 83s
21:58:33  ✓ Completed runAfterProductionCompile in 50s
21:58:35    Collecting page data using 3 workers ...
`

const OOM = `## Build Logs

23:51:58  Running build in Cleveland, USA (East) – cle1
23:51:58  Build machine configuration: 4 cores, 8 GB
23:52:31  Cloning completed: 33.477s
23:52:32  Restored build cache from previous deployment (BTKUmfWK356e3bAppdDmeRu4XKjr)
23:53:10    Creating an optimized production build ...
00:12:44  Error: The file "/vercel/path0/.next/routes-manifest.json" couldn't be found
00:12:44  ▲ Build system report
00:12:44  • At least one "Out of Memory" ("OOM") event was detected during the build.
00:12:44  • Folder sizes on disk:
00:12:44    ‣ Build cache:           <1 MB
00:12:44    ‣ Node modules:         1560 MB
00:12:44    ‣ Input source code:    2996 MB
`

describe('parseLines', () => {
  it('reads the HH:MM:SS prefix into seconds from the first line', () => {
    const lines = parseLines(HEALTHY)
    expect(lines[0].clock).toBe('00:11:02')
    expect(lines[0].at).toBe(0)
    expect(lines.find((l) => l.text.startsWith('Build Completed'))!.at).toBe(49)
  })

  it('carries a build across midnight instead of reporting a negative phase', () => {
    // The OOM capture starts at 23:51 and ends at 00:12 the next day. A naive clock subtraction
    // reports minus twenty-three hours, which reads as a build that finished before it started.
    const lines = parseLines(OOM)
    const last = lines[lines.length - 1]
    expect(last.at).toBeGreaterThan(0)
    expect(last.at).toBe(20 * 60 + 46)
  })

  it('attaches an untimestamped continuation line to the line above it', () => {
    const lines = parseLines('00:00:01  first\n    wrapped continuation\n00:00:02  second')
    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('first\nwrapped continuation')
  })
})

describe('a healthy build', () => {
  const r = readBuildLog(HEALTHY)

  it('names the machine, including the Enhanced class the region string hides', () => {
    // The region itself carries parentheses, so a lazy one-regex parse reads "(East) … (Enhanced
    // Build Machine" as the class. This is the assertion that pins the right-to-left parse.
    expect(r.machine).toMatchObject({
      region: 'Washington, D.C., USA (East)',
      regionCode: 'iad1',
      class: 'Enhanced Build Machine',
      cores: 8,
      memoryGb: 16,
    })
  })

  it('measures the page-data gap, which is the number this row has always wanted', () => {
    expect(r.pageData).toMatchObject({ workers: 7, gapSeconds: 4, isLastLine: false })
    expect(r.pageData!.nextLine!.text).toContain('Generating static pages')
  })

  it('reads the cache lineage and the upload line', () => {
    expect(r.cache.restoredFrom).toBe('HMpfD49ZoAu7RHYAUZqrYj1wHdb5')
    expect(r.cache.trimmed).toBe(false)
    expect(r.cache.uploaded).toBe('1.23 GB')
  })

  it('collects every postbuild gate line and finds none missing', () => {
    expect(r.gates.map((g) => g.name)).toEqual([
      'build-budget',
      'og-trace',
      'cache-budget',
      'shell-weight',
      'build-fanout',
    ])
    expect(r.gates.every((g) => g.status === '✅')).toBe(true)
    expect(r.missingGates).toEqual([])
  })

  it('reads the build system report and its folder sizes', () => {
    expect(r.systemReport).toMatchObject({ present: true, noProblems: true, oom: false })
    expect(r.systemReport.folders['Node modules']).toBe('948 MB')
    expect(r.systemReport.folders['Build cache']).toBe('<1 MB')
  })

  it('calls it healthy', () => {
    expect(r.verdict.state).toBe('healthy')
  })
})

describe('a stalled build — the LIVE-123 shape', () => {
  const r = readBuildLog(STALLED)

  it('records the OLD machine class, which is the fact the row never wrote down', () => {
    expect(r.machine).toMatchObject({ regionCode: 'cle1', class: null, cores: 4, memoryGb: 8 })
  })

  it('sees that page data is the last line ever written', () => {
    expect(r.pageData).toMatchObject({ workers: 3, isLastLine: true, gapSeconds: null })
  })

  it('says STALLED rather than reporting a fast build that simply ended', () => {
    // The trap this arm exists for: every phase before page data was HEALTHY and fast (83s compile,
    // 50s afterCompile). A reader that only totalled the phases it recognised would call this green.
    expect(r.verdict.state).toBe('stalled-at-page-data')
    expect(r.verdict.reason).toContain('Collecting page data')
  })

  it('notices that no postbuild gate ever ran, so this build produced NO gate readings', () => {
    expect(r.gates).toEqual([])
    expect(r.missingGates).toContain('check:build-budget'.replace('check:', ''))
    expect(r.missingGates.length).toBeGreaterThanOrEqual(5)
  })

  it('refuses to read a missing system report as health', () => {
    expect(r.systemReport.present).toBe(false)
    expect(formatReading(r)).toContain('its absence is not evidence of')
  })
})

describe('an OOM build — the one capture that reached the report', () => {
  const r = readBuildLog(OOM)

  it('names the Out of Memory event over the generic terminal error', () => {
    expect(r.systemReport.oom).toBe(true)
    expect(r.errors).toContain('routes-manifest.json was never written')
    expect(r.verdict.state).toBe('oom')
  })

  it('carries the folder sizes that make the OOM legible', () => {
    expect(r.systemReport.folders['Node modules']).toBe('1560 MB')
    expect(r.systemReport.folders['Build cache']).toBe('<1 MB')
  })
})

describe('the controls — a reader whose subject is silence must know when it read nothing', () => {
  it('refuses to certify a log it did not recognise', () => {
    // 🔴 THE FAIL-SAFE'S OWN GATE (AGENTS.md rule 6 / DEPLOY-SAFETY §6). Handed a runtime log, an
    // HTML error page, or an empty file, a naive parser finds no stall, no OOM and no missing gate
    // — and prints a clean bill of health for text it never understood.
    for (const junk of ['', 'no timestamps at all', '00:00:01  GET /feed 200\n00:00:02  GET /discover 200']) {
      const r = readBuildLog(junk)
      expect(r.verdict.state).toBe('unrecognised')
    }
  })

  it('calls a tail-only excerpt incomplete rather than healthy', () => {
    const tailOnly = [
      '00:11:48  ✅ check:build-budget — 6.12 GB across 458 functions, under the 8 GB budget.',
      '00:11:51  Build Completed in /vercel/output [34s]',
    ].join('\n')
    const r = readBuildLog(tailOnly)
    expect(r.verdict.state).toBe('incomplete')
    expect(r.verdict.reason).toContain('Collecting page data')
  })

  it('flags a build whose page data was fine but whose gates never printed', () => {
    const noGates = HEALTHY.split('\n')
      .filter((l) => !/check:/.test(l))
      .join('\n')
    const r = readBuildLog(noGates)
    expect(r.verdict.state).toBe('incomplete')
    expect(r.verdict.reason).toContain('postbuild gate')
  })

  it('separates slow from stalled at the documented threshold', () => {
    const slow = STALLED + '22:00:35    Generating static pages using 3 workers (0/254) ...\n'
    const r = readBuildLog(slow)
    expect(r.pageData!.gapSeconds).toBe(120)
    expect(r.pageData!.gapSeconds).toBeGreaterThan(PAGE_DATA_SLOW_SECONDS)
    expect(r.verdict.state).toBe('slow-page-data')
  })
})

describe('the gate list is read, not restated', () => {
  it('derives the expected gates from package.json postbuild', () => {
    // docs/DEPLOY-SAFETY.md: "package.json's postbuild script is the authority, quote it rather
    // than restating it." That list has drifted three times in prose. This reads it.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const names = expectedGates()
    expect(names.length).toBeGreaterThanOrEqual(5)
    for (const n of names) expect(pkg.scripts.postbuild).toContain(`scripts/check-${n}.mjs`)
    expect(names).toContain('cache-budget')
  })

  it('falls back to the five known names when package.json cannot be read', () => {
    expect(expectedGates({ scripts: {} })).toHaveLength(5)
  })
})

describe('the recorded baseline', () => {
  it('keeps the two populations apart, because they ran on different hardware', () => {
    expect(BASELINE.healthy.machine).toContain('8 cores')
    expect(BASELINE.stalled.machine).toContain('4 cores')
    expect(BASELINE.healthy.workers).toBe(7)
    expect(BASELINE.stalled.workers).toBe(3)
    expect(formatBaseline()).toContain('DIFFERENT HARDWARE')
  })
})
