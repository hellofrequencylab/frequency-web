// SCAN-1247: the fallback workflows' status read-back survives GitHub's read path being late.
// Runs each workflow's real read-back shell against a stub curl: a context that shows on the
// third read must pass; one that never shows, or a read that fails, must fail loudly.
// Exits 1 on main, where one immediate read decides.
// An optional first argument is another tree to read the workflows from (used to check main).
import { READBACK_WORKFLOWS, readBackFailures } from '../../lib/status-readback-harness.mjs'

const root = process.argv[2] || process.cwd()
let bad = 0
for (const w of READBACK_WORKFLOWS) {
  const failures = readBackFailures(w, root)
  console.log(`${failures.length ? 'FAIL' : 'ok  '} ${w.file}`)
  for (const f of failures) console.log(`       ${f}`)
  bad += failures.length
}
process.exit(bad ? 1 : 0)
