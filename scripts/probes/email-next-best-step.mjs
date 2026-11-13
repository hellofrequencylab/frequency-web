#!/usr/bin/env node
// EMAIL-046: the follow-up emails name the one next step a Space has not done, and say nothing when none is left.
//
// Runs lib/launch/next-best-step.ts under node (wizard order, null when done, skipped items never nag) and reads the
// three senders for the wiring: the operator day 1/3/7 run asks the helper and skips when nothing is left, falling back
// to the fixed copy only when the read fails; the launched welcome passes the next step to its builder.
import { readFileSync } from 'node:fs'
import { nextBestStep } from '../../lib/launch/next-best-step.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const item = (id, state, extra = {}) => ({ id, label: id, state, ...extra })
const sec = (id, items) => ({ id, title: id, items })

const open = [sec('spotlight', [item('sp-live', 'todo')]), sec('space', [item('sc-tag', 'todo')]), sec('website', [item('w-site', 'todo')])]
if (nextBestStep(open)?.id !== 'sp-live') bad.push('the first undone item in the wizard order is not the next step')
if (nextBestStep(open)?.href !== '/launch/step/spotlight') bad.push('the next step does not open its launch step')
const noSpot = [sec('website', [item('w-site', 'todo')]), sec('spotlight', [item('sp-live', 'done')]), sec('space', [item('sc-tag', 'todo')])]
if (nextBestStep(noSpot)?.id !== 'sc-tag') bad.push('sections are not read in the wizard order (Space before Website)')
if (nextBestStep([sec('space', [item('sc-tag', 'done')])]) !== null) bad.push('a finished Space still has a next step')
if (nextBestStep([sec('space', [item('sc-cover', 'todo', { skipped: true })])]) !== null) bad.push('a skipped item is offered as the next step')
if (/[—!]/.test(JSON.stringify(nextBestStep(open)))) bad.push('the next step copy has an em dash or an exclamation mark')

const lifecycle = read('lib/marketing/operator-lifecycle.ts')
const emails = read('lib/marketing/operator-emails.ts')
const launchedIo = read('lib/launch/launched-io.ts')
const launchedEmail = read('lib/launch/launched-email.ts')
if (!/nextBestStep\(/.test(lifecycle) || !/loadInventory\(/.test(lifecycle)) bad.push('the operator run does not read the inventory and ask the helper')
if (!/if \(!next\) return 'skipped'/.test(lifecycle)) bad.push('the operator run does not skip a day with nothing left')
if (!/resolveSendGate/.test(lifecycle) || !/operator_lifecycle:\$\{space\.id\}:\$\{day\}/.test(lifecycle)) bad.push('the operator run lost its send gate or its dedupe key')
if (!/next\?: NextBestStep/.test(emails)) bad.push('the operator builder does not take a next step')
if (!/nextBestStep\(/.test(launchedIo) || !/next/.test(launchedEmail)) bad.push('the launched welcome is not wired to the helper')

if (bad.length) {
  console.error(`EMAIL-046 probe FAILED:\n - ${bad.join('\n - ')}`)
  process.exit(1)
}
console.log('EMAIL-046 probe ok')
