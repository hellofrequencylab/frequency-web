#!/usr/bin/env node
// LIVE-2355 probe: login and reward popups are one styled toast, and one reward raises one toast.
// Fails on main: the daily check-in draws its own emoji pill (fixed top-20) naming the VISIT streak,
// and the Realtime feed labels every echo "Earned on another device", even on the earning device.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const bad = []
const checkin = read('components/daily-check-in.tsx')
if (/className=/.test(checkin)) bad.push('daily check-in still renders its own popup instead of the toast lane')
if (!/showZapToast\(/.test(checkin)) bad.push('daily check-in does not raise the shared reward toast')
if (/dayStreak/.test(checkin)) bad.push('welcome toast still names the visit streak, which disagrees with the practice "Day streak"')
if (/another device/.test(read('components/reward-live.tsx'))) bad.push('Realtime rewards still claim "another device"')
const zap = read('components/zap-toast.tsx')
if (!/export function mergeReward/.test(zap)) bad.push('the lane does not merge a local and a remote copy of one reward')
for (const f of ['components/on-air/session.tsx', 'components/on-air/movement-session.tsx']) {
  if (!/claimReward\(/.test(read(f))) bad.push(`${f}: the Mindless reveal does not claim the rewards it shows`)
}
if (!/inset-x-4/.test(read('components/toast-lane.tsx'))) bad.push('mobile toast lane is not a full-width bar above the tab bar')
if (bad.length) {
  console.error('LIVE-2355: ' + bad.join('; '))
  process.exit(1)
}
console.log('LIVE-2355: one toast lane, one toast per reward, no false "another device", no second streak')
