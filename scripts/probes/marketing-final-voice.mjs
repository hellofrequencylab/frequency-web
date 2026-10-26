import fs from 'node:fs'
import assert from 'node:assert/strict'
const read = p => fs.readFileSync(p, 'utf8')
const targets = [
  'app/discover/circles/page.tsx',
  'app/discover/events/page.tsx',
  'components/frequency/site/pages/discover/circles.tsx',
  'components/frequency/site/pages/discover/frequency-discover-events.tsx',
  'components/frequency/site/pages/discover/frequency-discover-hub.tsx',
  'components/frequency/site/pages/discover/practices.tsx',
  'components/frequency/site/pages/people/frequency-people.tsx',
  'components/frequency/site/pages/spaces/frequency-spaces.tsx',
  'components/frequency/site/pages/features/features-data.ts',
]
const retired = /notice the week you go missing|by the third time, they know your order|they both earn Zaps|they RSVP without an account|get a reminder the day before|thirteen weeks, then a fresh start|new Spaces get a first boost|memberships that drop them straight|it gets easier, and it sticks|among the first to know when the first one lands/i
for (const path of targets) assert(!retired.test(read(path).replace(/\s+/g, ' ')), `Retired guarantee remains in ${path}`)
const features = read(targets.at(-1))
assert(/id: 'f-tickets'[^\n]+tier: 'Business'/.test(features), 'Paid tickets must show the Business tier')
assert(/id: 'f-membership-p'[^\n]+listed benefits/.test(features), 'Membership card must describe listed benefits rather than guaranteed Circle admission')
assert(/id: 'f-invites'[^\n]+Eligible public events/.test(features), 'Guest RSVP must state eligibility')
for (const path of ['components/frequency/site/pages/people/frequency-people.tsx','components/frequency/site/pages/spaces/frequency-spaces.tsx']) {
  assert(read(path).includes('faqSchema(QUESTIONS.map'), 'Visible FAQ and JSONLD must retain the same source')
}
console.log('Public community copy qualifications and visible/schema FAQ source agree.')
