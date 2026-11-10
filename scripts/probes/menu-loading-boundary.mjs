// SPEED-MENU-LOADING: a menu click on a member page without its own loading boundary must paint
// something at once, not hold the old screen until the next page's reads finish.
import { existsSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

assert.ok(existsSync('app/(main)/loading.tsx'), 'the member group has a shared loading boundary')
const src = readFileSync('app/(main)/loading.tsx', 'utf8')
assert.ok(/Skeleton/.test(src) && /aria-busy/.test(src), 'it is a skeleton marked busy')
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'no hardcoded hex')
console.log('ok: member pages without their own loading face still paint instantly')
