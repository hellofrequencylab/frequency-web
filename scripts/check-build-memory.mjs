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
// VmRSS sum it saw, and writes them to a file in the temp directory. `postbuild` (no flag) stops the
// sampler and judges the reading. The budget is on the SUM OF HIGH-WATER MARKS, the same number the
// row was measured with: it never under-counts a spike between polls, and it over-counts when the
// processes peak at different moments, which is the safe direction for a gate.
//
// FAIL SAFE. Off Linux there is no /proc, and locally the gate only reports. On Vercel a missing
// reading FAILS the build: a sampler that silently stopped would read as a pass forever
// (AGENTS.md, "every fail-safe needs a gate that notices it fired").
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokedDirectly } from './lib/invoked-directly.mjs'

/** 7 GB: a 1 GB reserve under the 8 GB Standard machine for the OS, pnpm and the build runner. */
export const BUDGET_MB = 7168

export const STATE_FILE = path.join(os.tmpdir(), 'frequency-build-memory.json')
const TICK_MS = 250
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

function kb(status, key) {
  const m = status.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'))
  return m ? Number(m[1]) : 0
}

function sample() {
  const hwm = new Map()
  const started = Date.now()
  let concurrentKb = 0
  const tick = () => {
    let nowKb = 0
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
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
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ pid: process.pid, peakMb: Math.round(sum / 1024), concurrentMb: Math.round(concurrentKb / 1024), processes: hwm.size }),
    )
    if (Date.now() - started < MAX_SAMPLE_MS) setTimeout(tick, TICK_MS)
  }
  tick()
}

function start() {
  if (!existsSync('/proc/self/status')) {
    console.log('check-build-memory: no /proc on this platform; the build is not measured here.')
    return
  }
  rmSync(STATE_FILE, { force: true })
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--sample'], { detached: true, stdio: 'ignore' })
  child.unref()
  console.log(`check-build-memory: sampling the next build's memory (budget ${BUDGET_MB} MB).`)
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
  const { ok, message } = judge(reading, { onVercel: Boolean(process.env.VERCEL) })
  if (!ok) {
    console.error(`❌ check-build-memory (HYG-171): ${message}`)
    process.exit(1)
  }
  console.log(`✅ check-build-memory: ${message}`)
}

if (invokedDirectly(import.meta.url)) {
  if (process.argv.includes('--start')) start()
  else if (process.argv.includes('--sample')) sample()
  else finish()
}
