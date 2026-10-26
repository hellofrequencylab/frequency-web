import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = path => readFileSync(path, 'utf8')
const home = read('components/frequency/site/pages/home/frequency-home.tsx')
const weave = read('components/frequency/site/pages/home/weave-data.ts')
const join = read('components/frequency/site/pages/join/frequency-join.tsx')
const copy = `${home}\n${weave}`
for (const retired of ['Nudges while they’re still in the room', 'Members land in their Circle', 'Recurring support that drops people into their Circle', 'Six weeks, same group', '+25 Zaps for being there']) {
  assert(!copy.includes(retired), `Home still contains an unqualified claim: ${retired}`)
}
assert(/Paid Space plans\s+and introduction fees are separate/.test(home), 'Home must distinguish plan subscription from introduction fees')
assert(/pe: '.*Paid tickets start at Business/.test(home), 'Home Event card must state the paid-ticket tier')
assert(weave.includes('Paid tickets and memberships start at Business'), 'Weave payment story must state the paid-feature tier')
const steps = join.match(/const STEPS = \[([\s\S]*?)\] as const/)?.[1]
const count = steps?.match(/\bid:/g)?.length
const stated = Number(home.match(/<b>(\d+)<\/b>\s*<span>sign-up steps<\/span>/)?.[1])
assert.equal(stated, count, 'Home sign-up step count must match the join interface')
console.log('Home payment, membership, attendance and sign-up qualifications pass.')
