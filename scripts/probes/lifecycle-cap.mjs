// EMAIL-047: lifecycle email needs one cross-email cap and one registry. Fails on a tree without them: the cap module,
// the registry, the ledger migration, and the nurture runner calling the reservation before it enqueues.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

assert.ok(existsSync('lib/lifecycle/cap.ts'), 'lib/lifecycle/cap.ts (the pure cap rule) must exist')
assert.ok(existsSync('lib/lifecycle/registry.ts'), 'lib/lifecycle/registry.ts (every lifecycle email declared) must exist')
const mig = readdirSync('supabase/migrations').find((f) => f.endsWith('_lifecycle_send_log.sql'))
assert.ok(mig, 'a migration creating lifecycle_send_log must exist')
assert.ok(readFileSync(`supabase/migrations/${mig}`, 'utf8').includes('unique (dedupe_key)'), 'the ledger must be unique by dedupe key')
const runner = readFileSync('lib/nurture/runner.ts', 'utf8')
assert.ok(runner.indexOf('reserveLifecycleSend(') > 0 && runner.indexOf('reserveLifecycleSend(') < runner.indexOf('await enqueueEmail('), 'the nurture runner must reserve before it enqueues')
console.log('EMAIL-047 probe ok')
