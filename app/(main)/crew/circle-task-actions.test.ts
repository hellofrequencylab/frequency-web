import { describe, it, expect, vi, beforeEach } from 'vitest'

// createCircleTask (SCAN-687): a self-made Host is not a trusted economy actor. Every circle task
// is held for review (requires_verification forced on, whatever the form sent) and its Zap value
// is clamped to CIRCLE_TASK_ZAPS_CAP, so a Host cannot mint season Zaps through their own circle.

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  getMyProfileId: vi.fn(),
  getCircleCapabilities: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/core/load-capabilities', () => ({ getCircleCapabilities: mocks.getCircleCapabilities }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { createCircleTask } from './circle-task-actions'
import { CIRCLE_TASK_ZAPS_CAP } from '@/lib/crew/circle-task-policy'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue('host')
  mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.assignTask']))
  mocks.insert.mockResolvedValue({ error: null })
})

describe('createCircleTask', () => {
  it('forces requires_verification on even when the form says false', async () => {
    const res = await createCircleTask('c1', form({ name: 'Bring the speaker', zaps_value: '10', requires_verification: 'false' }))
    expect(res).toEqual({ ok: true })
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ requires_verification: true, circle_id: 'c1' }))
  })

  it('clamps the Zap value to CIRCLE_TASK_ZAPS_CAP', async () => {
    await createCircleTask('c1', form({ name: 'Mint', zaps_value: '9999' }))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ zaps_value: CIRCLE_TASK_ZAPS_CAP }))
    expect(CIRCLE_TASK_ZAPS_CAP).toBeLessThanOrEqual(100)
  })

  it('refuses a caller without circle.assignTask', async () => {
    mocks.getCircleCapabilities.mockResolvedValue(new Set())
    await expect(createCircleTask('c1', form({ name: 'x' }))).rejects.toThrow('Unauthorized')
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
