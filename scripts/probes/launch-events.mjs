#!/usr/bin/env node
// VLS-03: the launch funnel is pixel safe and its timings are computable.
//
// Fails when a launch event can carry anything but an opaque launch id, a step id and a source kind (persona,
// archetype, topic, interest, mood, answer text or source content), when pixelSafeProps would change an
// event's props, or when the median seconds from launch start to each publish stops being computed.
import { LAUNCH_EVENT_TYPES, LAUNCH_SOURCE_KINDS, launchEventProps, medianSecondsToPublish } from '../../lib/launch/events.ts'
import { LAUNCH_STEP_IDS } from '../../lib/launch/steps.ts'
import { pixelSafeProps } from '../../lib/analytics/sanitize.ts'

const ID = '0b1d2c3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
const BANNED = /persona|archetype|topic|interest|mood|answer|arrival/i
const ALLOWED = new Set(['launchId', 'step', 'sourceKind'])
const bad = []

for (const type of LAUNCH_EVENT_TYPES) {
  const variants = type === 'source_added' ? LAUNCH_SOURCE_KINDS.map((sourceKind) => ({ sourceKind })) : type.startsWith('step_') ? LAUNCH_STEP_IDS.map((step) => ({ step })) : [{}]
  for (const v of variants) {
    const props = launchEventProps({ type, launchId: ID, ...v, persona: 'healer', topic: 'grief', answer: 'my story' })
    if (!props) { bad.push(`${type} ${JSON.stringify(v)} was refused`); continue }
    if (JSON.stringify(pixelSafeProps(props)) !== JSON.stringify(props)) bad.push(`${type}: pixelSafeProps changes the props`)
    for (const k of Object.keys(props)) if (!ALLOWED.has(k)) bad.push(`${type}: carries ${k}`)
    if (BANNED.test(JSON.stringify(props))) bad.push(`${type}: carries a banned word`)
  }
}

const at = (s) => new Date(Date.UTC(2026, 9, 28, 12, 0, s))
const med = medianSecondsToPublish([
  { launchId: 'a', type: 'launch_started', at: at(0) },
  { launchId: 'b', type: 'launch_started', at: at(0) },
  { launchId: 'a', type: 'step_published', step: 'spotlight', at: at(100) },
  { launchId: 'b', type: 'step_published', step: 'spotlight', at: at(300) },
])
if (med.spotlight !== 200) bad.push(`the median to the Spotlight publish is ${med.spotlight}, not 200`)

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Launch events carry only a launch id, a step and a source kind, and the median time to each publish is computed.')
