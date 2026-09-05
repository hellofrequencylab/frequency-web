import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE TEMPLATE SERVER-ACTION SEAM (scan2 L9-08). Locked here, network-free (the implementation module
// + next/cache are mocked): updateSpaceEmailTemplate is EXPORTED from the 'use server' seam (it had no
// importer before), hands name + subject + body through to the gated implementation, and revalidates
// the email surface only on success.

const impl = {
  create: vi.fn(async () => ({ ok: true, data: { id: 'new' } })),
  update: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
}
vi.mock('@/lib/spaces/email-templates', () => ({
  createSpaceEmailTemplate: (...a: unknown[]) => impl.create(...(a as [])),
  updateSpaceEmailTemplate: (...a: unknown[]) => impl.update(...(a as [])),
  deleteSpaceEmailTemplate: (...a: unknown[]) => impl.remove(...(a as [])),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

import { updateSpaceEmailTemplate } from './email-templates-actions'

beforeEach(() => {
  for (const fn of Object.values(impl)) fn.mockClear()
  revalidatePath.mockClear()
})

describe('updateSpaceEmailTemplate (server-action seam)', () => {
  it('re-saves name + subject + body through the gated implementation and revalidates', async () => {
    const res = await updateSpaceEmailTemplate('space-A', 'river-studio', 'tpl-1', 'Welcome v2', 'Hi there', 'Body text')
    expect(res).toEqual({ ok: true })
    expect(impl.update).toHaveBeenCalledWith('space-A', 'tpl-1', 'Welcome v2', 'Hi there', 'Body text')
    expect(revalidatePath).toHaveBeenCalledWith('/spaces/river-studio/settings/email')
  })

  it('does not revalidate when the implementation rejects (not found / not permitted)', async () => {
    impl.update.mockResolvedValueOnce({ error: 'Template not found.' } as never)
    const res = await updateSpaceEmailTemplate('space-A', 'river-studio', 'tpl-x', 'Name', 'S', 'B')
    expect(res).toEqual({ error: 'Template not found.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
