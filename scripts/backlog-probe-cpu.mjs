// PROBE SELF-REPORT (HYG-062, ADR-1226). check-backlog.mjs preloads this into every `node` a cmd
// probe starts, through NODE_OPTIONS=--import. On exit the probe writes its own CPU cost to fd 3,
// the pipe the guard opened for exactly this line, so attribution comes from the PROBE rather than
// from the parent reading its reaped-children counters — which only worked while probes ran one at
// a time. A probe that spawned work of its own (a tsc, a shell) adds the CPU of the children it
// waited for, read from its own /proc/self/stat (cutime + cstime), so the number is what THIS
// probe cost end to end and nothing another probe cost in the same second.
//
// It must never break a probe: no fd 3 (the probe was run by hand), no /proc (not Linux) — every
// failure is swallowed and the probe's verdict stands.
import { readFileSync, writeSync } from 'node:fs'

function reapedChildrenMs() {
  try {
    const stat = readFileSync('/proc/self/stat', 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const ticks = Number(fields[13]) + Number(fields[14]) // cutime + cstime, in clock ticks
    return Number.isFinite(ticks) ? (ticks / 100) * 1000 : 0 // CLK_TCK is 100 wherever this runs
  } catch {
    return 0
  }
}

process.on('exit', () => {
  try {
    const own = process.cpuUsage()
    const ms = (own.user + own.system) / 1000 + reapedChildrenMs()
    writeSync(3, `probe-cpu ${ms.toFixed(3)}\n`)
  } catch {
    // fd 3 is not open, or cannot be written: the probe was not run by the guard.
  }
})
