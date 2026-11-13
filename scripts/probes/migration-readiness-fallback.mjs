// HYG-222: a PR that adds no SQL gets the required `migration-readiness` context straight away, draft or not, and a PR
// that touches supabase/migrations gets nothing from the fallback (the trusted gate stays its only voice).
// Exits 1 when the fallback is gone or could post over a SQL PR.
import { existsSync, readFileSync } from 'node:fs'
const f = '.github/workflows/migration-readiness-fallback.yml'
const y = existsSync(f) ? readFileSync(f, 'utf8') : ''
const checks = [
  ['the fallback workflow exists', y.length > 0],
  ['it runs on opened and ready_for_review', /types: \[[^\]]*opened[^\]]*ready_for_review/.test(y)],
  ['it posts the migration-readiness context as a commit status', /"context":"migration-readiness"/.test(y)],
  ['it posts only when no migration file changed', /if: steps\.pr\.outputs\.post == 'true' && steps\.decide\.outputs\.sql == 'false'/.test(y) && /grep -q '\^supabase\/migrations\/'/.test(y)],
  ['it stays unprivileged (no secrets beyond the token, no pull_request_target)', !/pull_request_target/.test(y.replace(/^\s*#.*$/gm, '')) && !/SUPABASE/.test(y)],
  ['the trusted gate is untouched (still skips drafts)', /!github\.event\.pull_request\.draft/.test(readFileSync('.github/workflows/migration-readiness.yml', 'utf8'))],
]
let bad = 0
for (const [l, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)
