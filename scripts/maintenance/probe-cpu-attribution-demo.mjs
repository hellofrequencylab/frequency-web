// ── WHY check-backlog's PROBES ARE NOT PARALLELISED (ADR-1190) ───────────────────────────────────
//
// Run me: `node scripts/maintenance/probe-cpu-attribution-demo.mjs`
//
// This is a RUNNABLE CONTROL for a claim that would otherwise be a paragraph nobody can check.
// `scripts/check-backlog.mjs` runs 224 probes SERIALLY and it looks like an obvious candidate for
// the capped-concurrency pool `.github/workflows/ci.yml` already uses for its 24 contract guards.
// It is not, and the reason is the measurement rather than the work.
//
// Per-probe CPU is read as a delta of `cutime + cstime` from /proc/self/stat — the kernel's
// cumulative CPU of this process's REAPED CHILDREN. That is process-wide. Serially it attributes
// perfectly, because exactly one child is reaped per window. Under a pool, a probe is charged for
// whatever else happened to be reaped inside its window.
//
// ADR-1107 built three assertions on that number: a 4,500ms PER-PROBE ceiling (the signal the gate
// exists for — "ONE probe got expensive", LIVE-034), a total of BASE + 180ms x n, and a self-report
// cross-checked against an external reading. Parallelising retires all three silently: the ceiling
// starts firing on innocent rows and NAMES THE WRONG ONE.
//
// The demo below makes a probe that truly costs ~50ms of CPU report several seconds, by having an
// expensive sibling complete inside its window. Measured 2026-09-01: 3,930ms attributed to the
// sleeper, and the total double-counted.

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const childCpuMs = () => {
  const stat = readFileSync('/proc/self/stat', 'utf8')
  const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  return ((Number(f[13]) + Number(f[14])) / 100) * 1000 // cutime + cstime, CLK_TCK 100
}

const BUSY = `node -e "let x=0;for(let i=0;i<3e8;i++)x+=i;process.exit(0)"`
const SLEEPER = `node -e "setTimeout(()=>process.exit(0),4000)"` // ~4s wall, ~50ms CPU
const run = (cmd) => new Promise((res) => spawn(cmd, { shell: true, stdio: 'ignore' }).on('close', res))

console.log('── SERIAL: how the guard measures today. Attribution is exact. ──')
for (const [name, cmd] of [['SLEEPER', SLEEPER], ['BUSY', BUSY]]) {
  const a = childCpuMs()
  spawnSync(cmd, { shell: true, stdio: 'ignore' })
  console.log(`  ${name.padEnd(8)} attributed ${Math.round(childCpuMs() - a)} ms`)
}

console.log('── PARALLEL: an expensive sibling completes inside the cheap probe’s window. ──')
const out = []
await Promise.all(
  [['SLEEPER', SLEEPER], ['BUSY', BUSY]].map(async ([name, cmd]) => {
    const a = childCpuMs()
    await run(cmd)
    out.push([name, Math.round(childCpuMs() - a)])
  }),
)
for (const [name, ms] of out) console.log(`  ${name.padEnd(8)} attributed ${ms} ms`)
console.log('\n  SLEEPER truly costs ~50ms of CPU. Serially it reads ~50ms; in the pool it reads seconds,')
console.log('  and the total is double-counted. That is why the runner stays serial (ADR-1190).')
