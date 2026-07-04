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
