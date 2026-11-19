#!/usr/bin/env node
// LIVE-2392: an owner who was set up before the launch knew their Space reads as set up. Runs the real pure
// decisions: which Space a launch with none attached takes, what its list then ticks, and where
// the Create a Space door sends an owner whose Spotlight is already live. No database, no test runner.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
const { adoptableSpace } = await import('../../lib/launch/space-choice.ts')
const { ownerEntryHref } = await import('../../lib/launch/wizard-resume.ts')
const { inventorySections } = await import('../../lib/launch/inventory.ts')
const { getStartedView, isPublished } = await import('../../lib/launch/get-started.ts')

const one = { id: 's1', slug: 'my-space', name: 'My Space', spotlightLive: true }
const two = { id: 's2', slug: 'other', name: 'Other', spotlightLive: false }
const bare = { spaceId: null, cancelledAt: null, completedAt: null }

// The launch takes the person's one Space, and never guesses between two or steals a new build.
assert.equal(adoptableSpace(bare, [one])?.id, 's1')
assert.equal(adoptableSpace(bare, [one, two]), null)
assert.equal(adoptableSpace(bare, []), null)
assert.equal(adoptableSpace({ ...bare, spaceId: 's9' }, [one]), null)
assert.equal(adoptableSpace({ ...bare, resume: { phase: 'builder' } }, [one]), null)
assert.equal(adoptableSpace({ ...bare, completedAt: '2026-11-18T00:00:00Z' }, [one]), null)
assert.equal(adoptableSpace({ ...bare, cancelledAt: '2026-11-18T00:00:00Z' }, [one]), null)

// With the Space attached, the list is the Space's own: what a record backs is ticked, and nothing else is.
const rows = {
  preferences: { spotlight: { published: true, layout: { rows: [], content: { links: { items: [] } } } }, websitePublished: true },
  tagline: 'Emotional Alchemy', about: 'A story', eventCount: 1, circleCount: 0, journeyCount: 0, contactCount: 3, payoutsReady: false,
}
const live = inventorySections({ rows, spaceName: 'My Space', coverImageUrl: 'c', logoUrl: 'l' })
const item = (id) => live.flatMap((s) => s.items).find((i) => i.id === id)
assert.equal(isPublished(live), true)
for (const id of ['space', 'website', 'email', 'schedule']) {
  const s = getStartedView(live).sections.find((x) => x.id === id)
  assert.equal(s.done, s.total, `${id} reads as done for an owner who has it`)
}
assert.equal(item('sp-live').state, 'done')
// A Spotlight arranged in the editor has no launch-form line: the tagline it wears counts (owner ruling 2026-11-19).
assert.equal(item('sp-words').state, 'done')
assert.equal(item('sp-words').found, '"Emotional Alchemy"')
const words = (published, tagline) => inventorySections({ rows: { ...rows, tagline, preferences: { ...rows.preferences, spotlight: { ...rows.preferences.spotlight, published } } }, spaceName: 'My Space', coverImageUrl: 'c', logoUrl: 'l' }).flatMap((s) => s.items).find((i) => i.id === 'sp-words').state
assert.equal(words(true, ''), 'todo')
assert.equal(words(false, 'Emotional Alchemy'), 'todo')
assert.equal(item('ci-first').state, 'todo')

// The Create a Space door: Spotlight setup while it is not live, the Space's own home once it is.
assert.equal(ownerEntryHref('my-space', false), '/spaces/my-space/manage/spotlight')
assert.equal(ownerEntryHref('my-space', false, false), '/spaces/my-space/manage/spotlight')
assert.equal(ownerEntryHref('my-space', false, true), '/spaces/my-space/manage')
assert.equal(ownerEntryHref('my-space', true, true), null)
assert.equal(ownerEntryHref('../x', false, true), null)
console.log('owner already set up: the launch takes their one Space, its list ticks what they have, and the door opens their Space home')
