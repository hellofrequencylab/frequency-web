#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BUILD-MEMORY GATE (HYG-171).
//
// The Vercel Standard build machine has 8 GB. On 2026-10-06 the cold compile of main peaked at
// about 7.8 GB (summed VmHWM of the `next` processes) and PR previews started dying with "Out of
// Memory", logged as `routes-manifest.json couldn't be found`. The owner moved to the 16 GB
// Enhanced machine to keep merges moving, at twice the per-minute price. This gate is the way back:
// it measures the real build's memory and fails it above BUDGET_MB, so the next creep is caught on
// a PR preview rather than by the machine.
//
// HOW IT MEASURES. A postbuild script runs after `next build` has exited, so it cannot see the
// peak itself. `prebuild` starts a detached sampler (`--start`), which polls /proc every 250 ms for
// every process whose command line runs `next/dist` (the build, Turbopack inside it, and its
// workers), keeps each one's VmHWM (the kernel's own high-water mark) and the largest concurrent
// VmRSS sum it saw, and writes them to node_modules/.cache/check-build-memory.json. `postbuild` (no flag) stops the
// sampler and judges the reading. The budget is on the SUM OF HIGH-WATER MARKS, the same number the
// row was measured with: it never under-counts a spike between polls, and it over-counts when the
// processes peak at different moments, which is the safe direction for a gate.
//
// WHAT IT JUDGES (HYG-241). Two numbers. The `next` sum above still has its budget, but since the
// compile moved into a process `isNextProcess` does not count, that sum reads about 100 MB while the
// machine is nearly full, so it cannot fire on the number that kills the build. The gate therefore
// also judges the CONTAINER peak (the cgroup's own high-water mark, which is what the kernel kills
// on). The sampler records it every tick and postbuild reads the cgroup once more. Every build
// prints that peak against CONTAINER_TARGET_MB as a trend; the build fails only above
// CONTAINER_HARD_STOP_MB, the last reading that was killed, so today's green builds stay green.
//
// FAIL SAFE. Off Linux there is no /proc, and locally the gate only reports. On Vercel a missing
// reading FAILS the build: a sampler that silently stopped would read as a pass forever
// (AGENTS.md, "every fail-safe needs a gate that notices it fired"). The same holds for the
// container: on Vercel an unreadable cgroup fails the build instead of passing unmeasured.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokedDirectly } from './lib/invoked-directly.mjs'

/** 7 GB: a 1 GB reserve under the 8 GB Standard machine for the OS, pnpm and the build runner. */
export const BUDGET_MB = 7168

/** The build machine: Vercel Standard, 8 GB. */
export const CONTAINER_LIMIT_MB = 8192
/** Where the container peak has to get back to (HYG-241's close condition: three production builds
 *  in a row under it). Printed as a trend on every build. It does not fail the build. */
export const CONTAINER_TARGET_MB = BUDGET_MB
/** The hard stop. A READING, not a guess: 7937 MB is the container peak of the preview build that was
 *  OOM-killed on 2026-11-15 (HYG-240 baseline). The three green production builds read on 2026-11-16
 *  peaked at 7768, 7784 and 7859 MB, all under it. Lower this as the compile shrinks; never raise it. */
export const CONTAINER_HARD_STOP_MB = 7937

// Inside the repo, not the shared temp directory (CodeQL: insecure temporary file). Not under .next/,
// which `next build` empties after prebuild has started the sampler. start() removes any stale copy.
export const STATE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'check-build-memory.json')
const TICK_MS = 250
const REPORT_INTERVAL_MS = 30_000
const MAX_SAMPLE_MS = 60 * 60 * 1000

/** True for a process that belongs to the Next build. A shell whose command text merely mentions
 *  the path (`sh -c "... next/dist ..."`) is a wrapper, not the build, and is not counted. */
export function isNextProcess(cmdline) {
  return cmdline.includes('next/dist') && !/^(\S*\/)?(sh|bash|dash) /.test(cmdline)
}

/** Pass or fail on a reading. `reading` is null when the sampler never reported. */
export function judge(reading, { onVercel }) {
  if (!reading) {
    return onVercel
      ? { ok: false, message: 'no reading: the sampler started in prebuild never reported, so this build was not measured' }
      : { ok: true, message: 'no reading (not Linux, or prebuild did not run); skipped locally' }
  }
  const line = `peak ${reading.peakMb} MB summed high-water across ${reading.processes} next process(es), ${reading.concurrentMb} MB at once; budget ${BUDGET_MB} MB`
  if (reading.peakMb > BUDGET_MB) {
    return {
      ok: false,
      message: `${line}. The compile no longer fits the Standard machine with headroom. Find what grew (DEPLOY-SAFETY fan-out rule); do not raise the budget.`,
    }
  }
  return { ok: true, message: line }
}

/** HYG-241: pass or fail on the container peak, the number the kernel kills on. `container` is
 *  `{ peakMb }`, or null when no cgroup file could be read. Off Vercel it only reports: a laptop or a
 *  shared CI box has its own cgroup, which says nothing about the 8 GB build machine. */
export function judgeContainer(container, { onVercel }) {
  if (!container || !Number.isFinite(container.peakMb)) {
    return onVercel
      ? { ok: false, message: 'no container reading: the cgroup memory files could not be read, so the number that kills the build was not measured' }
      : { ok: true, message: 'no container reading (no cgroup memory files here); skipped locally' }
  }
  const { peakMb } = container
  const overTarget = peakMb - CONTAINER_TARGET_MB
  const trend = overTarget > 0 ? `${overTarget} MB over the ${CONTAINER_TARGET_MB} MB target` : `${-overTarget} MB under the ${CONTAINER_TARGET_MB} MB target`
  const line = `container peak ${peakMb} MB of ${CONTAINER_LIMIT_MB} MB (${CONTAINER_LIMIT_MB - peakMb} MB of margin), ${trend}; hard stop above ${CONTAINER_HARD_STOP_MB} MB`
  if (onVercel && peakMb > CONTAINER_HARD_STOP_MB) {
    return {
      ok: false,
      message: `${line}. This build peaked above the last reading that was killed for memory. Find what grew in the compile (DEPLOY-SAFETY fan-out rule); do not raise the hard stop.`,
    }
  }
  return { ok: true, message: line }
}

/** The container peak for the judge: the largest of what the sampler recorded and a fresh read of the
 *  cgroup in postbuild (the kernel's high-water mark only grows, so the fresh read covers a spike
 *  between the sampler's last tick and the end of the build). Null when neither exists. */
export function containerPeak(reading, fresh) {
  const peaks = [reading?.containerPeakMb, fresh?.peakMb].filter((n) => Number.isFinite(n))
  return peaks.length ? { peakMb: Math.max(...peaks) } : null
}

/** Publish the first observed peak, then one running reading per interval. */
export function runningPeakReporter(write = console.log) {
  let nextReportAt = 0
  return (reading, elapsedMs) => {
    if (reading.processes === 0 || elapsedMs < nextReportAt) return
    nextReportAt = elapsedMs + REPORT_INTERVAL_MS
    write(`check-build-memory: running peak after ${Math.floor(elapsedMs / 1000)}s: ${reading.peakMb} MB summed high-water across ${reading.processes} next process(es), ${reading.concurrentMb} MB at once.`)
  }
}

const CONTAINER_REPORT_MS = 10_000
const CGROUP_FILES = [
  ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.peak'],
  ['/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes'],
]

/** HYG-224: the whole container's memory, which is what the kernel kills on, not just the `next`
 *  processes. On 2026-11-14 eight production builds in a row died ~80 s into the compile while this
 *  sampler read 86 MB: the process doing the compile is not counted by `isNextProcess`. */
export function readContainerMemory(read = (f) => readFileSync(f, 'utf8')) {
  for (const [cur, peak] of CGROUP_FILES) {
    try {
      const currentMb = Math.round(Number(read(cur)) / 1048576)
      let peakMb = currentMb
      try { peakMb = Math.max(currentMb, Math.round(Number(read(peak)) / 1048576)) } catch { /* no peak file */ }
      if (Number.isFinite(currentMb)) return { currentMb, peakMb }
    } catch {
      /* try the next cgroup layout */
    }
  }
  return null
}

/** The largest processes by resident memory, any command, so a build killed with the sampler still
 *  names who grew. `procs` is [{ name, rssKb }]. */
export function topProcesses(procs, n = 3) {
  return [...procs].sort((a, b) => b.rssKb - a.rssKb).slice(0, n)
}

/** One log line for the container reading plus the biggest processes. */
export function containerLine(container, procs, elapsedMs) {
  const head = container
    ? `container ${container.currentMb} MB now, ${container.peakMb} MB peak`
    : 'container memory unreadable (no cgroup files)'
  const top = topProcesses(procs).map((p) => `${p.name} ${Math.round(p.rssKb / 1024)} MB`).join(', ') || 'none'
  return `check-build-memory: ${Math.floor(elapsedMs / 1000)}s ${head}; biggest processes: ${top}.`
}

function kb(status, key) {
  const m = status.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'))
  return m ? Number(m[1]) : 0
}

function sample() {
  const hwm = new Map()
  const started = Date.now()
  const reportPeak = runningPeakReporter()
  let nextContainerAt = 0
  let concurrentKb = 0
  let containerPeakMb = null
  const tick = () => {
    let nowKb = 0
    const all = new Map()
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
      try {
        const st = readFileSync(`/proc/${pid}/status`, 'utf8')
        const name = (st.match(/^Name:\s+(\S+)/m) ?? [])[1] ?? pid
        all.set(pid, { name, rssKb: kb(st, 'VmRSS') })
      } catch {
        /* gone */
      }
      try {
        const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
        if (!isNextProcess(cmd)) continue
        const status = readFileSync(`/proc/${pid}/status`, 'utf8')
        hwm.set(pid, Math.max(hwm.get(pid) ?? 0, kb(status, 'VmHWM')))
        nowKb += kb(status, 'VmRSS')
      } catch {
        /* the process exited between readdir and read */
      }
    }
    concurrentKb = Math.max(concurrentKb, nowKb)
    let sum = 0
    for (const v of hwm.values()) sum += v
    const reading = {
      pid: process.pid,
      peakMb: Math.round(sum / 1024),
      concurrentMb: Math.round(concurrentKb / 1024),
      processes: hwm.size,
    }
    // HYG-241: the container peak goes into the state file every tick so postbuild can judge it.
    const container = readContainerMemory()
    if (container) containerPeakMb = Math.max(containerPeakMb ?? 0, container.peakMb)
    if (containerPeakMb !== null) reading.containerPeakMb = containerPeakMb
    writeFileSync(STATE_FILE, JSON.stringify(reading))
    const elapsedMs = Date.now() - started
    reportPeak(reading, elapsedMs)
    if (elapsedMs >= nextContainerAt) {
      nextContainerAt = elapsedMs + CONTAINER_REPORT_MS
      console.log(containerLine(container, [...all.values()], elapsedMs))
    }
    if (elapsedMs < MAX_SAMPLE_MS) setTimeout(tick, TICK_MS)
  }
  tick()
}

function start() {
  if (!existsSync('/proc/self/status')) {
    console.log('check-build-memory: no /proc on this platform; the build is not measured here.')
    return
  }
  mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  rmSync(STATE_FILE, { force: true })
  // The detached sampler outlives prebuild, but shares the build log so an OOM leaves a reading.
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--sample'], {
    detached: true,
    stdio: ['ignore', 'inherit', 'ignore'],
  })
  child.unref()
  console.log(`check-build-memory: sampling the next build's memory (next processes budget ${BUDGET_MB} MB; container hard stop above ${CONTAINER_HARD_STOP_MB} MB).`)
}

function finish() {
  let reading = null
  try {
    reading = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    reading = null
  }
  if (reading?.pid) {
    try {
      process.kill(reading.pid)
    } catch {
      /* already gone */
    }
  }
  const onVercel = Boolean(process.env.VERCEL)
  const next = judge(reading, { onVercel })
  // No sampler reading means no build was measured here; the line below already says so (and fails
  // on Vercel), so the container is only judged for a build the sampler actually watched.
  const container = reading ? judgeContainer(containerPeak(reading, readContainerMemory()), { onVercel }) : null
  if (next.ok) console.log(`✅ check-build-memory: ${next.message}`)
  else console.error(`❌ check-build-memory (HYG-171): ${next.message}`)
  if (container?.ok) console.log(`✅ check-build-memory: ${container.message}`)
  else if (container) console.error(`❌ check-build-memory (HYG-241): ${container.message}`)
  if (!next.ok || (container && !container.ok)) process.exit(1)
}

if (invokedDirectly(import.meta.url)) {
  if (process.argv.includes('--start')) start()
  else if (process.argv.includes('--sample')) sample()
  else finish()
}
