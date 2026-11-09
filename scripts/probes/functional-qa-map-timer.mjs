// SCAN-1176: the map-seam and timer runtime tests exist, run in the required `test` job, and still carry their cases.
// In-process, like LIVE-034: it reads the four files and the vitest config instead of spawning a second vitest run.
// `pnpm test` (the required `test` check) already runs these files, so the probe's job is to prove they are still
// IN that run and still HAVE their cases; it no longer re-runs them, which cost 2.4s of CPU here and 4.6s in CI
// against a 4.5s per-probe ceiling (scripts/backlog-contract.test.ts). Exits non-zero when one goes missing, is
// excluded from the run, loses cases, or is skipped.
import { existsSync, readFileSync } from 'node:fs'

// The case counts at the time the row closed (4, 9, 5, 5). A file that drops below its floor lost coverage.
const files = {
  'components/maps/map-canvas-seam.test.tsx': 4,
  'lib/nurture/runner.test.ts': 9,
  'lib/seasons-go-live.test.ts': 5,
  'lib/member-day-boundaries.test.ts': 5,
}
const bad = []
const config = existsSync('vitest.config.ts') ? readFileSync('vitest.config.ts', 'utf8') : ''
if (!/include:\s*\[[^\]]*\*\.test\.ts['"][^\]]*\*\.test\.tsx['"]/.test(config)) bad.push('vitest.config.ts no longer includes **/*.test.ts and **/*.test.tsx')
const excluded = (config.match(/exclude:\s*\[([^\]]*)\]/)?.[1] ?? '').match(/['"][^'"]+['"]/g)?.map((s) => s.slice(1, -1)) ?? []
for (const [file, floor] of Object.entries(files)) {
  if (!existsSync(file)) { bad.push(`missing: ${file}`); continue }
  const hit = excluded.find((e) => { const dir = e.replace(/^\*\*\//, '').replace(/\/\*\*$/, ''); return file.startsWith(`${dir}/`) || file.includes(`/${dir}/`) })
  if (hit) bad.push(`${file} is excluded from the vitest run by ${hit}`)
  const src = readFileSync(file, 'utf8')
  const cases = (src.match(/^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm) ?? []).length
  if (cases < floor) bad.push(`${file}: ${cases} cases, expected at least ${floor}`)
  const skipped = src.match(/\b(?:it|test|describe)\.(?:skip|only|todo)\b/)
  if (skipped) bad.push(`${file}: ${skipped[0]} keeps its cases out of the run`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
