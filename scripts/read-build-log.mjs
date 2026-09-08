#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// READ A VERCEL BUILD LOG — phase timings, postbuild gate lines, and a verdict.
//
// WHY THIS EXISTS (LIVE-123, ADR-1259). This repo has spent six weeks chasing a build that goes
// silent at "Collecting page data using N workers ..." and dies tens of minutes later. Every
// investigation of it began the same way: open a deployment, scroll a 400-line log, subtract two
// timestamps by hand, and hope the next person subtracts the same two. Four hypotheses were tested
// and killed that way, and each cost a session's worth of reconstruction before it could even be
// stated.
//
// The stall is invisible to Vercel's error group by construction — a hung build logs nothing, so
// there is nothing to group — which is why AGENTS.md's rule applies to the row itself: DURATION is
// the instrument, not errors. This file is that instrument. Give it a build log and it prints the
// phase boundaries, the page-data gap, the five postbuild gate readings, the build system report,
// and one verdict line. One command instead of a reconstruction.
//
// 🔴 IT IS A READER, NOT A GATE. It never fails a build and is not wired into `postbuild`. A gate
// that has never seen the artifact it judges is docs/DEPLOY-SAFETY.md's own incident with the roles
// reversed; this tool judges a LOG, which is not the artifact, so it stays a reader on purpose.
//
// USAGE
//   node scripts/read-build-log.mjs <path-to-log>      # save the log first, then read it
//   pbpaste | node scripts/read-build-log.mjs -        # or pipe it in
//   node scripts/read-build-log.mjs <log> --json       # machine-readable
//   node scripts/read-build-log.mjs --baseline         # print the recorded reading to compare against
//
// GETTING THE LOG: the Vercel dashboard's build log has a copy button; `vercel inspect --logs
// <url>` prints it; an agent with the Vercel MCP tools can save `get_deployment_build_logs`
// output to a file. The parser only needs the `HH:MM:SS  text` lines, in order.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ── THE RECORDED READING, so a future one has something to be compared against ────────────────
//
// Taken 2026-09-08 across the twenty deployments of the 2026-09-07 23:38Z – 2026-09-08 00:13Z merge
// burst, plus the six captured stalls the LIVE-123 ledger names. The two populations ran on
// DIFFERENT HARDWARE, which is the whole point of writing the numbers down here: every stall in the
// ledger was measured on a 4-core/8 GB cle1 builder, and that machine class no longer serves this
// project. Compare a new reading against the row that matches its machine, never across the two.
export const BASELINE = Object.freeze({
  measured: '2026-09-08',
  row: 'LIVE-123',
  healthy: Object.freeze({
    machine: 'iad1 Enhanced Build Machine, 8 cores, 16 GB',
    workers: 7,
    sample: 20,
    compile: '12.7-62s (warm 13-16s, coldish 32-62s)',
    pageDataGap: '4-10s',
    outcome: '20 of 20 READY',
  }),
  stalled: Object.freeze({
    machine: 'cle1, 4 cores, 8 GB',
    workers: 3,
    sample: 6,
    compile: '77-118s, always cold, against a 46s warm control',
    pageDataGap: '2460-2770s (41-46 min) with no further line, then ERROR',
    outcome: 'BUILD_EXCEEDED_MAXIMUM_TIME at ~2770.6s, twice, 136 ms apart',
  }),
})

/** A page-data gap this long is worth a second look; the healthy sample tops out at 10s. */
export const PAGE_DATA_SLOW_SECONDS = 60
/** Past this with the log still moving, treat it as the LIVE-123 shape rather than a slow build. */
export const PAGE_DATA_STALL_SECONDS = 600

const TS_LINE = /^(\d{2}):(\d{2}):(\d{2})\s{1,}(.*)$/

/**
 * Split a log into timestamped lines, in seconds since the first line.
 *
 * Vercel prints wall-clock UTC with no date, so a build that crosses midnight goes backwards.
 * Any step backwards is treated as a day boundary — a build never emits out-of-order lines, and
 * the alternative (a negative phase duration) is exactly the reading this tool exists to get right.
 */
export function parseLines(text) {
  const out = []
  let dayOffset = 0
  let prev = -1
  for (const raw of String(text).split(/\r?\n/)) {
    const m = TS_LINE.exec(raw)
    if (!m) {
      // A continuation line (a wrapped warning box, a stack frame) belongs to the line above it.
      if (out.length && raw.trim()) out[out.length - 1].text += `\n${raw.trim()}`
      continue
    }
    const clock = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    if (prev >= 0 && clock < prev - 60) dayOffset += 86400
    prev = clock
    out.push({ clock: m[1] + ':' + m[2] + ':' + m[3], at: clock + dayOffset, text: m[4] })
  }
  if (out.length) {
    const base = out[0].at
    for (const l of out) l.at -= base
  }
  return out
}

/**
 * The gate names `postbuild` actually runs, read out of package.json rather than restated.
 *
 * docs/DEPLOY-SAFETY.md: "package.json's postbuild script is the authority, quote it rather than
 * restating it". That list has drifted three times in prose; this reads it. Falls back to the
 * five known names only when package.json is unreadable (a log pasted outside the repo).
 */
export function expectedGates(pkgJson) {
  const FALLBACK = ['build-budget', 'og-trace', 'cache-budget', 'shell-weight', 'build-fanout']
  try {
    const pkg = pkgJson ?? JSON.parse(readFileSync('package.json', 'utf8'))
    const found = [...String(pkg.scripts?.postbuild ?? '').matchAll(/scripts\/check-([a-z0-9-]+)\.mjs/g)].map(
      (m) => m[1],
    )
    return found.length ? found : FALLBACK
  } catch {
    return FALLBACK
  }
}

const PATTERNS = {
  machineConfig: /^Build machine configuration:\s*(\d+)\s*cores?,\s*(\d+)\s*GB/,
  cloneDone: /^Cloning completed:\s*(.+)$/,
  cacheRestored: /^Restored build cache from previous deployment \(([A-Za-z0-9_]+)\)/,
  cacheSkipped: /^Skipping build cache/,
  cacheTooLarge: /Previous build cache was too large/,
  compiled: /Compiled successfully in\s+(.+?)\s*$/,
  afterCompile: /Completed runAfterProductionCompile in\s+(.+?)\s*$/,
  pageData: /Collecting page data using (\d+) workers/,
  staticStart: /Generating static pages using \d+ workers \(0\//,
  buildCompleted: /Build Completed in .*?\[(.+?)\]/,
  gate: /^([✅❌⚠])️?\s+check:([a-z0-9-]+)\s*(?:—|-)?\s*(.*)$/,
  trim: /trimmed the build cache/,
  systemReport: /^▲?\s*Build system report/,
  noProblems: /No memory or disk space problems detected/,
  oom: /"?Out of Memory"?\s*\(?"?OOM"?\)?.*detected|At least one "Out of Memory"/,
  folder: /^‣?\s*([A-Za-z ]+?):\s+(<?\d+(?:\.\d+)?)\s*(MB|GB|KB)/,
  cacheUpload: /Uploading build cache \[(.+?)\]/,
  routesManifest: /routes-manifest\.json"? couldn't be found/,
  maxTime: /BUILD_EXCEEDED_MAXIMUM_TIME/,
}

/**
 * @typedef {{ region: string | null, regionCode: string | null, class: string | null, cores: number | null, memoryGb: number | null }} Machine
 * @typedef {{ name: string, clock: string, at: number, took?: string, workers?: number }} Phase
 * @typedef {{ status: string, name: string, detail: string, clock: string }} Gate
 * @typedef {{ clock: string, text: string }} Excerpt
 * @typedef {{ workers: number, clock: string, at: number, nextLine: Excerpt | null, gapSeconds: number | null, isLastLine: boolean, silenceSeconds: number | null }} PageData
 * @typedef {{ present: boolean, noProblems: boolean, oom: boolean, folders: Record<string, string> }} SystemReport
 * @typedef {{ restoredFrom: string | null, skipped: boolean, tooLarge: boolean, trimmed: boolean, uploaded: string | null }} CacheReading
 * @typedef {{ state: 'healthy' | 'slow-page-data' | 'stalled-at-page-data' | 'oom' | 'failed' | 'incomplete' | 'unrecognised', reason: string }} Verdict
 * @typedef {{ lineCount: number, machine: Machine | null, cache: CacheReading, phases: Phase[], pageData: PageData | null, gates: Gate[], missingGates: string[], systemReport: SystemReport, errors: string[], lastLine: Excerpt | null, totalSeconds: number, verdict: Verdict }} Reading
 */

/**
 * Parse a build log into a structured reading. Pure: no I/O beyond the package.json gate list.
 *
 * @param {string} text
 * @param {{ expectedGates?: string[] }} [opts]
 * @returns {Reading}
 */
export function readBuildLog(text, opts = {}) {
  const lines = parseLines(text)
  const gateNames = opts.expectedGates ?? expectedGates()

  /** @type {Reading} */
  const r = {
    lineCount: lines.length,
    machine: null,
    cache: { restoredFrom: null, skipped: false, tooLarge: false, trimmed: false, uploaded: null },
    phases: [],
    pageData: null,
    gates: [],
    missingGates: [],
    systemReport: { present: false, noProblems: false, oom: false, folders: {} },
    errors: [],
    lastLine: lines.length ? { clock: lines[lines.length - 1].clock, text: lines[lines.length - 1].text } : null,
    totalSeconds: lines.length ? lines[lines.length - 1].at : 0,
    verdict: { state: 'unrecognised', reason: 'no build-log lines found' },
  }

  /** @param {string} name @param {{clock: string, at: number}} line @param {Partial<Phase>} [extra] */
  const phase = (name, line, extra = {}) =>
    r.phases.push({ name, clock: line.clock, at: line.at, ...extra })

  let pageDataLine = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.text
    let m

    if (!r.machine && t.startsWith('Running build in ')) {
      // Parsed right-to-left rather than with one regex: the region itself carries parentheses
      // ("Washington, D.C., USA (East) – iad1 (Enhanced Build Machine)"), so a lazy pattern happily
      // reads "(East) … (Enhanced Build Machine" as the machine class. Peel the known suffixes off.
      let rest = t.slice('Running build in '.length).trim()
      let cls = null
      const clsM = /\(([^()]*Build Machine[^()]*)\)\s*$/.exec(rest)
      if (clsM) {
        cls = clsM[1]
        rest = rest.slice(0, clsM.index).trim()
      }
      let code = null
      const codeM = /[–—-]\s*([A-Za-z0-9]+)\s*$/.exec(rest)
      if (codeM) {
        code = codeM[1]
        rest = rest.slice(0, codeM.index).trim()
      }
      r.machine = { region: rest, regionCode: code, class: cls, cores: null, memoryGb: null }
    } else if ((m = PATTERNS.machineConfig.exec(t))) {
      r.machine = { ...(r.machine ?? { region: null, regionCode: null, class: null }), cores: Number(m[1]), memoryGb: Number(m[2]) }
    } else if ((m = PATTERNS.cloneDone.exec(t))) {
      phase('clone', line, { took: m[1] })
    } else if ((m = PATTERNS.cacheRestored.exec(t))) {
      r.cache.restoredFrom = m[1]
    } else if (PATTERNS.cacheSkipped.test(t)) {
      r.cache.skipped = true
    } else if (PATTERNS.cacheTooLarge.test(t)) {
      r.cache.tooLarge = true
    } else if ((m = PATTERNS.compiled.exec(t))) {
      phase('compile', line, { took: m[1] })
    } else if ((m = PATTERNS.afterCompile.exec(t))) {
      phase('afterProductionCompile', line, { took: m[1] })
    } else if ((m = PATTERNS.pageData.exec(t))) {
      pageDataLine = { index: i, line, workers: Number(m[1]) }
      phase('collect-page-data', line, { workers: Number(m[1]) })
    } else if (PATTERNS.staticStart.test(t)) {
      phase('generate-static-pages', line)
    } else if ((m = PATTERNS.buildCompleted.exec(t))) {
      phase('build-completed', line, { took: m[1] })
    } else if ((m = PATTERNS.cacheUpload.exec(t))) {
      r.cache.uploaded = m[1]
    }

    if (PATTERNS.trim.test(t)) r.cache.trimmed = true
    if ((m = PATTERNS.gate.exec(t))) r.gates.push({ status: m[1], name: m[2], detail: m[3], clock: line.clock })
    if (PATTERNS.systemReport.test(t)) r.systemReport.present = true
    if (PATTERNS.noProblems.test(t)) r.systemReport.noProblems = true
    if (PATTERNS.oom.test(t)) r.systemReport.oom = true
    if (r.systemReport.present && (m = PATTERNS.folder.exec(t.replace(/^[•‣\s]+/, '')))) {
      r.systemReport.folders[m[1].trim()] = `${m[2]} ${m[3]}`
    }
    if (PATTERNS.routesManifest.test(t)) r.errors.push('routes-manifest.json was never written')
    if (PATTERNS.maxTime.test(t)) r.errors.push('BUILD_EXCEEDED_MAXIMUM_TIME')
  }

  // ── the page-data gap: the one number this row has always wanted ───────────────────────────
  if (pageDataLine) {
    const next = lines[pageDataLine.index + 1] ?? null
    r.pageData = {
      workers: pageDataLine.workers,
      clock: pageDataLine.line.clock,
      at: pageDataLine.line.at,
      nextLine: next ? { clock: next.clock, text: next.text.split('\n')[0] } : null,
      gapSeconds: next ? next.at - pageDataLine.line.at : null,
      isLastLine: !next,
      silenceSeconds: next ? null : r.totalSeconds - pageDataLine.line.at,
    }
  }

  const seen = new Set(r.gates.map((g) => g.name))
  r.missingGates = gateNames.filter((n) => !seen.has(n))

  r.verdict = verdictFor(r)
  return r
}

/**
 * One line that says what this log is.
 *
 * 🔴 The `unrecognised` arm is the gate on this reader's own fail-safe (AGENTS.md: every fail-safe
 * needs a gate that notices it fired). A parser handed the wrong text — a truncated tail, a runtime
 * log, an HTML error page — otherwise finds no stall, no OOM and no missing gate, and prints a
 * clean bill of health for a file it never understood. Silence is this row's entire symptom, so a
 * reader that cannot tell "nothing wrong" from "nothing read" is worse than no reader.
 */
export function verdictFor(r) {
  const sawBuild = Boolean(r.machine) || Boolean(r.pageData) || r.gates.length > 0
  if (!sawBuild) {
    return { state: 'unrecognised', reason: 'no machine line, no page-data line and no gate line — this is not a Vercel Next build log, or the excerpt is too small to read' }
  }
  if (r.pageData?.isLastLine) {
    return {
      state: 'stalled-at-page-data',
      reason: `the log ENDS at "Collecting page data using ${r.pageData.workers} workers" — this is the LIVE-123 shape. Nothing after it was ever written.`,
    }
  }
  if (r.systemReport.oom) {
    return { state: 'oom', reason: 'the build system report names an Out of Memory event' }
  }
  if (r.errors.length) {
    return { state: 'failed', reason: r.errors.join('; ') }
  }
  if (r.pageData && r.pageData.gapSeconds !== null && r.pageData.gapSeconds >= PAGE_DATA_STALL_SECONDS) {
    return { state: 'stalled-at-page-data', reason: `page data went quiet for ${r.pageData.gapSeconds}s` }
  }
  if (r.pageData && r.pageData.gapSeconds !== null && r.pageData.gapSeconds >= PAGE_DATA_SLOW_SECONDS) {
    return { state: 'slow-page-data', reason: `page data took ${r.pageData.gapSeconds}s against a ${BASELINE.healthy.pageDataGap} healthy band` }
  }
  if (!r.pageData) {
    return { state: 'incomplete', reason: 'no "Collecting page data" line in this excerpt — read the whole log, not the tail' }
  }
  if (r.missingGates.length) {
    return { state: 'incomplete', reason: `page data was fine, but ${r.missingGates.length} postbuild gate(s) never printed: ${r.missingGates.join(', ')}` }
  }
  return { state: 'healthy', reason: `page data ${r.pageData.gapSeconds}s, all ${r.gates.length} gate line(s) printed` }
}

const ICON = { healthy: '✅', 'slow-page-data': '⚠️', 'stalled-at-page-data': '🔴', oom: '🔴', failed: '🔴', incomplete: '⚠️', unrecognised: '⚠️' }

/** @param {Reading} r */
export function formatReading(r) {
  const out = []
  const say = (s = '') => out.push(s)

  say(`${ICON[r.verdict.state] ?? '•'} ${r.verdict.state.toUpperCase()} — ${r.verdict.reason}`)
  say()

  if (r.machine) {
    const cls = r.machine.class ? ` (${r.machine.class})` : ''
    const size = r.machine.cores ? `${r.machine.cores} cores, ${r.machine.memoryGb} GB` : 'size not printed'
    say(`  machine    ${r.machine.region ?? '?'}${r.machine.regionCode ? ` · ${r.machine.regionCode}` : ''}${cls} — ${size}`)
  } else {
    say('  machine    not printed in this excerpt')
  }

  const cache = r.cache.skipped
    ? 'skipped (deployment triggered without cache)'
    : r.cache.restoredFrom
      ? `restored from ${r.cache.restoredFrom}`
      : 'no restore line'
  say(`  cache      ${cache}${r.cache.tooLarge ? ' · PREVIOUS CACHE WAS TOO LARGE' : ''}${r.cache.trimmed ? ' · check:cache-budget TRIMMED this build' : ''}${r.cache.uploaded ? ` · uploaded ${r.cache.uploaded}` : ''}`)
  say()

  say('  PHASES')
  for (const p of r.phases) {
    const extra = p.took ? ` (${p.took})` : p.workers ? ` (${p.workers} workers)` : ''
    say(`    ${p.clock}  ${p.name}${extra}`)
  }
  if (!r.phases.length) say('    (none recognised)')
  say()

  if (r.pageData) {
    say('  PAGE DATA — the phase this row is about')
    say(`    started ${r.pageData.clock} with ${r.pageData.workers} workers`)
    if (r.pageData.isLastLine) {
      say(`    🔴 NOTHING FOLLOWS IT. The log ends here${r.pageData.silenceSeconds ? `, ${r.pageData.silenceSeconds}s after the previous line` : ''}.`)
    } else {
      say(`    next line ${r.pageData.nextLine.clock} after ${r.pageData.gapSeconds}s — ${r.pageData.nextLine.text}`)
    }
    say(`    healthy band ${BASELINE.healthy.pageDataGap} on ${BASELINE.healthy.machine} (${BASELINE.measured}, n=${BASELINE.healthy.sample})`)
    say(`    stalled band ${BASELINE.stalled.pageDataGap} on ${BASELINE.stalled.machine} (n=${BASELINE.stalled.sample})`)
    say()
  }

  say('  POSTBUILD GATES')
  for (const g of r.gates) say(`    ${g.status} check:${g.name} — ${g.detail}`)
  if (!r.gates.length) say('    none printed — the build never reached postbuild')
  if (r.missingGates.length) say(`    ⚠️ never printed: ${r.missingGates.join(', ')}`)
  say()

  say('  BUILD SYSTEM REPORT')
  if (!r.systemReport.present) {
    say('    not reached. ⚠️ Only a build that COMPLETES prints it, so its absence is not evidence of')
    say('    health and its "No memory or disk space problems detected" is not evidence against a')
    say('    memory hypothesis. (LIVE-123 spent four hypotheses on that asymmetry.)')
  } else {
    say(`    ${r.systemReport.oom ? '🔴 OUT OF MEMORY event reported' : r.systemReport.noProblems ? '✅ no memory or disk space problems detected' : 'reported, no verdict line parsed'}`)
    for (const [k, v] of Object.entries(r.systemReport.folders)) say(`    ${k}: ${v}`)
  }
  if (r.errors.length) {
    say()
    say('  TERMINAL ERRORS')
    for (const e of r.errors) say(`    🔴 ${e}`)
  }

  return out.join('\n')
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

async function main(argv) {
  const args = argv.filter((a) => a !== '--json' && a !== '--baseline')
  const asJson = argv.includes('--json')

  if (argv.includes('--baseline')) {
    console.log(asJson ? JSON.stringify(BASELINE, null, 2) : formatBaseline())
    return 0
  }

  const file = args[0]
  if (!file) {
    console.error('usage: node scripts/read-build-log.mjs <path-to-build-log | -> [--json]')
    console.error('       node scripts/read-build-log.mjs --baseline')
    return 2
  }

  const text = file === '-' ? await readStdin() : readFileSync(file, 'utf8')
  const reading = readBuildLog(text)
  console.log(asJson ? JSON.stringify(reading, null, 2) : formatReading(reading))
  // Always exits 0. This is a reader, not a gate — see the header.
  return 0
}

export function formatBaseline() {
  return [
    `LIVE-123 baseline, measured ${BASELINE.measured}`,
    '',
    '  HEALTHY POPULATION',
    `    ${BASELINE.healthy.machine}, ${BASELINE.healthy.workers} workers, n=${BASELINE.healthy.sample}`,
    `    compile ${BASELINE.healthy.compile} · page data ${BASELINE.healthy.pageDataGap} · ${BASELINE.healthy.outcome}`,
    '',
    '  STALLED POPULATION (every capture in the row, all on the OLD machine class)',
    `    ${BASELINE.stalled.machine}, ${BASELINE.stalled.workers} workers, n=${BASELINE.stalled.sample}`,
    `    compile ${BASELINE.stalled.compile} · page data ${BASELINE.stalled.pageDataGap} · ${BASELINE.stalled.outcome}`,
    '',
    '  🔴 The two populations ran on DIFFERENT HARDWARE. Compare a new reading against the row that',
    '     matches its own "Build machine configuration" line, never across the two.',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
