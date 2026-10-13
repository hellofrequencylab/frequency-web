// LIVE-914 (Phase 0.5 of docs/LAUNCH-MARKETING-PLAN.md): the welcome email, the day 1/3/7 nudges,
// the invite card, the Market Read and the empty Network state stop promising what the product
// does not do and stop leaning on FOMO. Fails if any removed line returns to its file.
// Comments are stripped so the doc notes that name the old phrase do not trip it.
import { readFileSync } from 'node:fs'
const source = (path) => readFileSync(path, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const banned = {
  'lib/email.ts': [/you both earn/i, /connected to your community/i, /earn as you go/i],
  'app/api/cron/lifecycle-triggers/route.ts': [
    /Welcome to \$\{circleName\}!/, /circle feed/, /earn some Zaps!/, /One week in \$\{circleName\}!/, /leaderboard/i,
  ],
  'components/sidebar/invite-friend-button.tsx': [/find your people/i, /Earn Zaps when they join/],
  'lib/marketing/market-read.ts': [
    /Get in early/i, /first through the door/i, /one of the founders, not a follower/i, /find your circle/i,
    /found a circle yet/, /active circle\$/,
  ],
  'app/(main)/network/page.tsx': [/Others are looking too/i],
}
// The referral promise must say what the code does: the newcomer is paid on joining, the
// referrer only once the friend activates (lib/qr/referral.ts ACTIVATION_EVENTS).
const required = {
  'lib/email.ts': [/you earn Zaps once they join a Circle or pick up a Practice/],
  'components/sidebar/invite-friend-button.tsx': [/you earn Zaps once they join a Circle or pick up a Practice/],
}
let failed = 0
for (const [file, patterns] of Object.entries(banned)) {
  const text = source(file)
  for (const re of patterns) if (re.test(text)) { console.error(`LIVE-914: ${file} carries ${re}`); failed++ }
}
for (const [file, patterns] of Object.entries(required)) {
  const text = source(file)
  for (const re of patterns) if (!re.test(text)) { console.error(`LIVE-914: ${file} lost ${re}`); failed++ }
}
if (failed) process.exitCode = 1
else console.log('LIVE-914: lifecycle copy holds (no false referral promise, no FOMO lines in scope)')
