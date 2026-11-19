#!/usr/bin/env node
// LIVE-2401: an owner who asks for a NEW Space gets one. /launch/start with new=1, from someone who already owns
// a Space, marks the launch as the builder's, which is the one mark the adopt rule (LIVE-2392) leaves alone.
// Without it /launch, the rail and the feed attach the Space they already own and a second can never start.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { adoptableSpace } = await import('../../lib/launch/space-choice.ts')
const one = { id: 's1', slug: 'my-space', name: 'My Space', spotlightLive: true }
const bare = { spaceId: null, cancelledAt: null, completedAt: null }
assert.equal(adoptableSpace(bare, [one])?.id, 's1', 'an unmarked launch still takes the one Space')
assert.equal(adoptableSpace({ ...bare, resume: { phase: 'builder' } }, [one]), null, 'a builder launch is left alone')
const route = readFileSync('app/(main)/launch/start/route.ts', 'utf8')
assert.ok(/q\.get\('new'\) === '1' && \(await listOwnedSpaces\(profileId\)\)\.length > 0/.test(route), 'the door knows an owner asked for a new Space')
assert.ok(route.includes("{ ...base, phase: 'builder' as const }"), 'that launch is marked as the builder making a new Space')
assert.ok(/if \(entryResume\) await saveWizardResume\(launch, entryResume\)/.test(route), 'the mark is saved on the launch it starts')
console.log('LIVE-2401: a new Space asked for by an owner starts as a new Space')
