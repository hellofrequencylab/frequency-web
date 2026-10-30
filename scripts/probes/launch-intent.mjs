#!/usr/bin/env node
// LIVE-1917: a fresh launch asks what the person came to set up (a Space, or just a personal Spotlight).
//
// Fails when the launch page stops asking, or the personal choice stops pointing at a route that exists.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
if (!readFileSync('app/(main)/launch/page.tsx', 'utf8').includes('LaunchIntent')) bad.push('the launch page no longer asks what the person is setting up')
if (!existsSync('app/(main)/launch/personal/page.tsx')) bad.push('the personal Spotlight choice points at the personal step, which is gone')
if (!readFileSync('components/launch/launch-intent.tsx', 'utf8').includes('PERSONAL_SPOTLIGHT_HREF')) bad.push('the intent screen lost its personal Spotlight choice')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch intent: ok')
