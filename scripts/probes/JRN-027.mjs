#!/usr/bin/env node
// JRN-027: three places on a Journey stop saying something untrue. A locked week is called a week (or month), not a
// phase, and does not promise a Circle a solo learner does not have. A finished Journey with an optional step left
// reads as finished in its headline as well as its kicker. The Library's Continue card does not promise a next week
// on a yearly Journey whose every month is done.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const player = readFileSync('components/journey/v2/learn/learn-player.tsx', 'utf8')
const home = readFileSync('components/frequency/members/journey/journey-course-body.tsx', 'utf8')
const library = readFileSync('app/(main)/journeys/library/page.tsx', 'utf8')
assert.ok(player.includes('This {unit} is still locked') && !player.includes('This phase is still locked'), 'a locked week is named by the cadence')
assert.ok(!player.includes('the whole Circle moves together'), 'the locked panel does not assume a Circle')
const title = home.slice(home.indexOf('const heroTitle'), home.indexOf('const heroWhy'))
assert.ok(title.indexOf('tree.complete') > -1 && title.indexOf('tree.complete') < title.indexOf(': next'), 'finished wins over an optional step in the headline')
const why = home.slice(home.indexOf('const heroWhy'), home.indexOf('const cta'))
assert.ok(why.indexOf('tree.complete') < why.indexOf(': next'), 'and in the line under it')
assert.ok(/resume\.ongoing && resume\.complete \? `Every \$\{resume\.unit\} is done\. It repeats each year\.`/.test(library), 'the Continue card tells a finished yearly Journey the truth')
console.log('JRN-027: locked weeks, finished Journeys and the Continue card say what is true')
