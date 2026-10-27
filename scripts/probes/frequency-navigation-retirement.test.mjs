import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { problems, MASKS, RETIRED } from './frequency-navigation-retirement.mjs'
const read = f => fs.readFileSync(f, 'utf8')
test('actual source passes and every retired implementation is rejected if restored', () => {
  assert.deepEqual(problems(read, fs.existsSync), [])
  for (const target of RETIRED) assert.ok(problems(read, f => f === target || fs.existsSync(f)).some(p => p.includes(target)))
})
test('each actual live mask is load-bearing', () => {
  for (const [target, mask] of MASKS) assert.ok(problems(f => f === target ? read(f).replaceAll(`data-visual-mask="${mask}"`, '') : read(f), fs.existsSync).some(p => p.includes(mask)))
})
test('actual shell count, consumer, overview and creation mounts have failing controls', () => {
  for (const [target, token] of [
    ['components/frequency/members/shell/members-shell.tsx', 'drafts: myFrequency?.drafts'],
    ['components/frequency/members/shell/header.tsx', 'row(r.href, r.label, r.icon, r.count)'],
    ['app/(main)/spaces/[slug]/manage/manage-board.tsx', '<FqOverviewBody'],
    ['components/frequency/members/marketplace/marketplace-body.tsx', 'href="/classifieds/new"'],
    ['app/(main)/admin/layout.tsx', '<FrequencyAdminConsole'],
  ]) assert.ok(problems(f => f === target ? read(f).replaceAll(token, '') : read(f), fs.existsSync).length > 0, token)
})
