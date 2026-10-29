#!/usr/bin/env node
// LIVE-1914: after Publish the launch pill stays as "Finish setup" over the Get Started list.
//
// Fails when the box loader goes back to returning nothing once the Spotlight is published, or when the header pill
// loses the "Finish setup" face.
import { readFileSync } from 'node:fs'

const bad = []
const box = readFileSync('lib/launch/box.ts', 'utf8')
if (/if \(await loadPostPublishList\(profileId\)\) return null/.test(box)) bad.push('lib/launch/box.ts returns nothing after Publish again')
if (!box.includes('setupBoxView')) bad.push('lib/launch/box.ts no longer builds the Finish setup box')

const pill = readFileSync('components/frequency/members/shell/launch-box.tsx', 'utf8')
if (!pill.includes('Finish setup')) bad.push('the header pill lost its "Finish setup" face')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('finish setup pill: ok')
