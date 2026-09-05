import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE SEGMENT SERVER-ACTION SEAM (scan2 L9-08). What is locked here, network-free (the implementation
// module + next/cache are mocked):
//   1. updateSpaceSegment is EXPORTED from the 'use server' seam (it had no importer before), so the
//      picker's rename door exists across the network boundary.
//   2. A rename without a definition re-reads the segment's stored definition, space-scoped, and hands
//      THAT to the implementation (the client never supplies the definition it cannot see).
//   3. An unknown segment id fails closed with no write; a successful write revalidates the email surface.

const impl = {
  create: vi.fn(async () => ({ ok: true, data: { id: 'new' } })),
  update: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
  list: vi.fn(async () => [
    { id: 'seg-1', name: 'Regulars', definition: { tag: 'regular' }, createdAt: null },
    { id: 'seg-2', name: 'Newcomers', definition: { tag: 'new' }, createdAt: null },
  ]),
}
vi.mock('@/lib/spaces/segments', () => ({
  createSpaceSegment: (...a: unknown[]) => impl.create(...(a as [])),
  updateSpaceSegment: (...a: unknown[]) => impl.update(...(a as [])),
  deleteSpaceSegment: (...a: unknown[]) => impl.remove(...(a as [])),
  listSpaceSegments: (...a: unknown[]) => impl.list(...(a as [])),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

import { updateSpaceSegment } from './segments-actions'

beforeEach(() => {
  for (const fn of Object.values(impl)) fn.mockClear()
  revalidatePath.mockClear()
})

describe('updateSpaceSegment (server-action seam)', () => {
  it('renames a segment, carrying its STORED definition into the implementation', async () => {
    const res = await updateSpaceSegment('space-A', 'river-studio', 'seg-1', 'Regulars (Tuesday)')
    expect(res).toEqual({ ok: true })
    expect(impl.list).toHaveBeenCalledWith('space-A')
    expect(impl.update).toHaveBeenCalledWith('space-A', 'seg-1', 'Regulars (Tuesday)', { tag: 'regular' })
    expect(revalidatePath).toHaveBeenCalledWith('/spaces/river-studio/settings/email')
  })

  it('passes an explicit definition straight through (redefine + rename)', async () => {
    await updateSpaceSegment('space-A', 'river-studio', 'seg-2', 'Fresh faces', { tag: 'fresh' })
    expect(impl.list).not.toHaveBeenCalled()
    expect(impl.update).toHaveBeenCalledWith('space-A', 'seg-2', 'Fresh faces', { tag: 'fresh' })
  })

  it('fails closed for a segment the Space does not have (no write, no revalidate)', async () => {
    const res = await updateSpaceSegment('space-A', 'river-studio', 'seg-of-space-B', 'Hacked')
    expect(res).toEqual({ error: 'Segment not found.' })
    expect(impl.update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not revalidate when the implementation rejects the write', async () => {
    impl.update.mockResolvedValueOnce({ error: 'Segment name is required.' } as never)
    const res = await updateSpaceSegment('space-A', 'river-studio', 'seg-1', '')
    expect(res).toEqual({ error: 'Segment name is required.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
