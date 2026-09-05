import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-18 (2026-09-05). The operator "edit dispatch" form carries poll options as a JSON
// string. A malformed value used to surface as a raw SyntaxError ("Unexpected token o in JSON");
// the operator now gets one plain sentence, and a well-formed list still lands.

const pollWrites: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'staff-1', community_role: 'admin', webRole: 'admin' }) }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: async (caller: unknown) => caller }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async (rows: unknown) => { if (table === 'dispatch_poll_options') pollWrites.push(rows); return { error: null } },
    }),
  }),
}))

import { updateDispatch } from './actions'

function form(pollOptions: string) {
  const fd = new FormData()
  fd.set('title', 'Poll')
  fd.set('body', 'Which night?')
  fd.set('dispatch_type', 'poll')
  fd.set('audience_scope', 'global')
  fd.set('audience_id', 'x')
  fd.set('poll_options', pollOptions)
  return fd
}

beforeEach(() => { pollWrites.length = 0 })

describe('updateDispatch: poll options', () => {
  it('refuses malformed JSON with a plain sentence, not a SyntaxError', async () => {
    await expect(updateDispatch('d1', form('[oops'))).rejects.toThrow('Poll options could not be read.')
    await expect(updateDispatch('d1', form('[oops'))).rejects.not.toBeInstanceOf(SyntaxError)
    expect(pollWrites).toHaveLength(0)
  })

  it('refuses JSON of the wrong shape the same way', async () => {
    await expect(updateDispatch('d1', form('{"a":1}'))).rejects.toThrow('Poll options could not be read.')
    await expect(updateDispatch('d1', form('[1,2]'))).rejects.toThrow('Poll options could not be read.')
  })

  it('writes a well-formed list', async () => {
    await updateDispatch('d1', form('["Friday"," Saturday ",""]'))
    expect(pollWrites).toEqual([[
      { dispatch_id: 'd1', label: 'Friday', position: 0 },
      { dispatch_id: 'd1', label: 'Saturday', position: 1 },
    ]])
  })
})
