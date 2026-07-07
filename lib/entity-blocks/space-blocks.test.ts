import { describe, it, expect } from 'vitest'
import { partitionSpaceBlocks } from './space-blocks'
import { blocksForKind } from './registry'
import { filterPickerBlocks } from '@/components/entity-blocks/block-picker'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// ADR-516 Phase D. The Space page builder must not offer a block the space cannot use: a DATA block gated
// by a `requiresFunction` (booking → availability, team → members) is LOCKED when that function is off, and
// arrangeable when it is on. partitionSpaceBlocks is the pure gate; the builder feeds its `arrangeable`
// palette to the picker (which then also excludes already-placed ids).

const all = blocksForKind('space')

describe('partitionSpaceBlocks (requiresFunction locking)', () => {
  it('locks a function-gated block when its function is off, and offers ungated blocks', () => {
    const { arrangeable, lockedIds } = partitionSpaceBlocks(new Set<SpaceFunctionKey>())
    // `booking` requires `availability`; `team` requires `members` — both off here → locked.
    expect(lockedIds).toContain('booking')
    expect(lockedIds).toContain('team')
    // `about` / `offerings` carry no requiredFunction → always arrangeable.
    expect(arrangeable.map((b) => b.id)).toContain('about')
    expect(arrangeable.map((b) => b.id)).toContain('offerings')
    expect(arrangeable.map((b) => b.id)).not.toContain('booking')
  })

  it('offers a gated block once its function is on', () => {
    const { arrangeable, lockedIds } = partitionSpaceBlocks(new Set<SpaceFunctionKey>(['availability']))
    expect(arrangeable.map((b) => b.id)).toContain('booking')
    expect(lockedIds).not.toContain('booking')
  })

  it('partition is total: every space block is either arrangeable or locked, never both', () => {
    const { arrangeable, lockedIds } = partitionSpaceBlocks(new Set<SpaceFunctionKey>(['availability']))
    expect(arrangeable.length + lockedIds.length).toBe(all.length)
    const overlap = arrangeable.filter((b) => lockedIds.includes(b.id))
    expect(overlap).toHaveLength(0)
  })
})

// ADR-573 item 6: "don't show a function unless it EXISTS". The `functionAware` gate locks a function-backed
// block whose function has NO data yet, even when its switch is on. Offerings/events have no requiresFunction,
// so the switch gate alone never hid them — this closes that gap.
describe('partitionSpaceBlocks (item 6 existing-data gate)', () => {
  const everyFunction = new Set<SpaceFunctionKey>(['availability', 'members', 'memberships', 'tickets', 'donations', 'enroll'])
  const functionBacked = new Set(['offerings', 'booking', 'events', 'team', 'journeys', 'circles', 'reviews', 'faq', 'updates'])

  it('locks a function-backed block that has NO data (offerings with no offerings)', () => {
    const { lockedIds, arrangeable } = partitionSpaceBlocks(everyFunction, {
      functionBacked,
      existing: new Set(['events']), // only events has data
    })
    expect(lockedIds).toContain('offerings') // function-backed but empty → locked
    expect(lockedIds).toContain('team')
    expect(arrangeable.map((b) => b.id)).toContain('events') // exists → offered
  })

  it('offers a function-backed block once it has data', () => {
    const { arrangeable, lockedIds } = partitionSpaceBlocks(everyFunction, {
      functionBacked,
      existing: new Set(['offerings']),
    })
    expect(arrangeable.map((b) => b.id)).toContain('offerings')
    expect(lockedIds).not.toContain('offerings')
  })

  it('never gates a non-function-backed block on data (authored + design blocks always offered)', () => {
    const { arrangeable } = partitionSpaceBlocks(everyFunction, { functionBacked, existing: new Set() })
    const ids = arrangeable.map((b) => b.id)
    // Callout + the design blocks are not function-backed, so an empty `existing` set never locks them.
    expect(ids).toContain('callout')
    expect(ids).toContain('photoHero')
  })

  it('composes with the switch gate: a switch-off block stays locked regardless of data', () => {
    const { lockedIds } = partitionSpaceBlocks(new Set<SpaceFunctionKey>(), {
      functionBacked,
      existing: new Set(['booking']), // even if booking "existed"...
    })
    // ...its `availability` switch is off, so it stays locked (switchLocked wins).
    expect(lockedIds).toContain('booking')
  })

  it('omitting functionAware preserves the legacy switch-only behaviour', () => {
    const legacy = partitionSpaceBlocks(new Set<SpaceFunctionKey>(['members']))
    expect(legacy.arrangeable.map((b) => b.id)).toContain('offerings')
    expect(legacy.arrangeable.map((b) => b.id)).toContain('team') // members on
  })
})

describe('space block picker (arrangeable palette, exclude placed)', () => {
  it('excludes locked and already-placed blocks from the picker', () => {
    const { arrangeable } = partitionSpaceBlocks(new Set<SpaceFunctionKey>())
    const taken = new Set(['about']) // already placed
    const { suggested, all: rest } = filterPickerBlocks(arrangeable, taken, '')
    const ids = [...suggested, ...rest].map((b) => b.id)
    expect(ids).not.toContain('about') // placed
    expect(ids).not.toContain('booking') // function-locked (never in the arrangeable palette)
    expect(ids).toContain('offerings') // available
  })
})
