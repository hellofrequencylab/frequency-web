import { describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn(() => { throw new Error('Introduction coaching must not access the database') })
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

import { executeReadTool } from './read-tools'

describe('introduction coaching', () => {
  it('offers questions and the human composer without a message, write, or notification', async () => {
    const result = await executeReadTool('draft_intro', { toHandle: '@Maya' })
    expect(result).toContain('@maya')
    expect(result).toContain('Ask one question at a time')
    expect(result).toContain('/feed')
    expect(result).toContain('Nothing has been posted or sent')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('does not interpolate an invalid handle into coaching', async () => {
    const result = await executeReadTool('draft_intro', { toHandle: 'maya; publish this now' })
    expect(result).not.toContain('publish this now')
    expect(result).toContain('Ask which person')
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
