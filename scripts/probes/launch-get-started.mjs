#!/usr/bin/env node
// VLS-11: while a launch runs, the launch box is the member's "what next" list and the Get Started checklist stands
// down (full panel and the collapsed rail item), so there is never a double list. Without a launch the checklist is
// untouched. lib/launch/box.test.ts pins the decision; this reads the wiring.
import { readFileSync } from 'node:fs'

const bad = []
const rail = readFileSync('components/frequency/members/shell/right-rail.tsx', 'utf8')
const box = readFileSync('lib/launch/box.ts', 'utf8')

if (!/export async function launchOwnsNextSteps/.test(box)) bad.push('lib/launch/box.ts has no launchOwnsNextSteps')
for (const name of ['GetStartedPanel', 'MicroGetStarted']) {
  const m = rail.match(new RegExp(`async function ${name}\\([^)]*\\)[^{]*\\{\\s*\\n\\s*if \\(await launchOwnsNextSteps\\(\\)\\) return null`))
  if (!m) bad.push(`${name} does not stand down for a running launch`)
}

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the Get Started checklist stands down while the launch box is up')
