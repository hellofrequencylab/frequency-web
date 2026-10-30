#!/usr/bin/env node
// LIVE-1926: Founder's First Week is folded into the Setup list as a Personal group.
import { readFileSync } from 'node:fs'
const io = readFileSync('lib/launch/inventory-io.ts', 'utf8')
if (!io.includes('personalSection') || !io.includes('getFounderTasks')) {
  console.error('the Setup list no longer carries the Personal group')
  process.exit(1)
}
console.log('launch personal group: ok')
