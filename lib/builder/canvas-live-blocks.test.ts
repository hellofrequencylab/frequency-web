import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({ existing: vi.fn() }))
vi.mock('@/lib/entity-blocks/block-data-sources', () => ({
  FUNCTION_BACKED_BLOCK_TYPES: ['offerings', 'booking', 'events', 'team', 'journeys', 'circles', 'reviews', 'faq', 'memberships'],
  existingFunctionBackedBlocks: data.existing,
}))

import { canvasLiveBlockIds } from './canvas-live-blocks'

// PROG-E6F. The canvas offers a live section only when the Space page builder's own rule lets this Space place it:
// its function switch is on, and a function-backed section has data now.

const space = (entitlements: Record<string, boolean> = {}) => ({ id: 'space-1', type: 'business' as const, entitlements })

beforeEach(() => { data.existing.mockReset() })

describe('canvasLiveBlockIds', () => {
  it('offers sections with no data source, and function-backed ones only once they have data', async () => {
    data.existing.mockResolvedValue(new Set(['events', 'booking']))
    const ids = await canvasLiveBlockIds(space())
    expect(ids).toEqual(expect.arrayContaining(['about', 'story', 'contact', 'events', 'booking']))
    expect(ids).not.toContain('offerings')
    expect(ids).not.toContain('faq')
    expect(ids).not.toContain('callout')
    expect(data.existing).toHaveBeenCalledWith('space-1')
  })
  it('holds a section back when its switch is off, even with data', async () => {
    data.existing.mockResolvedValue(new Set(['events', 'booking']))
    expect(await canvasLiveBlockIds(space({ availability: false }))).not.toContain('booking')
  })
  it('offers nothing, and says so, when the data check fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    data.existing.mockRejectedValue(new Error('down'))
    expect(await canvasLiveBlockIds(space())).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[canvas] live sections'), expect.any(Error))
    warn.mockRestore()
  })
})
