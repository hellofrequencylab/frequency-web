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
assert(/See \/pricing for current ticket options and fees/.test(home), 'Home Event card must point to /pricing for ticket options and fees')
assert(/who introduced the buyer\. See \/pricing for current rates/.test(home.replace(/\s+/g, ' ')), 'Home must say fees depend on plan and who introduced the buyer, and point to /pricing')
assert(weave.includes('Paid tickets and memberships start at Business'), 'Weave payment story must state the paid-feature tier')
assert(!/sign-up steps/.test(home), 'Home no longer states a sign-up step count (the Join interface owns it)')
console.log('Home payment, membership, attendance and sign-up qualifications pass.')
