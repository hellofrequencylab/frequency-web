// HYG-242: the in-process half of a "these tests pass" probe, after LIVE-034 and SCAN-1176.
// `pnpm test` (the required `test` check) already runs every **/*.test.ts(x) file, so a probe that spawns a second
// vitest run pays its whole startup again in the backlog sweep and proves nothing the `test` job does not. Instead a
// probe asks this helper whether each file is still IN that run and still HAS its cases. A file that goes missing,
// is excluded by vitest.config.ts, drops below the case count it had when its row closed, or carries a .skip / .only
// / .todo reports a problem, so the row reads OPEN again exactly when its coverage is lost.
import { existsSync, readFileSync } from 'node:fs'

const CASE = /^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm

/** @param {Record<string, number>} files test file -> minimum case count. @returns {string[]} problems. */
export function inSuite(files) {
  const bad = []
  const config = existsSync('vitest.config.ts') ? readFileSync('vitest.config.ts', 'utf8') : ''
  if (!/include:\s*\[[^\]]*\*\.test\.ts['"][^\]]*\*\.test\.tsx['"]/.test(config)) bad.push('vitest.config.ts no longer includes **/*.test.ts and **/*.test.tsx')
  const excluded = (config.match(/exclude:\s*\[([^\]]*)\]/)?.[1] ?? '').match(/['"][^'"]+['"]/g)?.map((s) => s.slice(1, -1)) ?? []
  for (const [file, floor] of Object.entries(files)) {
    if (!existsSync(file)) { bad.push(`missing: ${file}`); continue }
    const hit = excluded.find((e) => { const dir = e.replace(/^\*\*\//, '').replace(/\/\*\*$/, ''); return file.startsWith(`${dir}/`) || file.includes(`/${dir}/`) })
    if (hit) bad.push(`${file} is excluded from the vitest run by ${hit}`)
    const src = readFileSync(file, 'utf8')
    const cases = (src.match(CASE) ?? []).length
    if (cases < floor) bad.push(`${file}: ${cases} cases, expected at least ${floor}`)
    const skipped = src.match(/\b(?:it|test|describe)\.(?:skip|only|todo)\b/)
    if (skipped) bad.push(`${file}: ${skipped[0]} keeps its cases out of the run`)
  }
  return bad
}

/** Exit non-zero with the problems, or print `ok` and exit 0. */
export function requireInSuite(files, ok) {
  const bad = inSuite(files)
  if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
  if (ok) console.log(ok)
}
