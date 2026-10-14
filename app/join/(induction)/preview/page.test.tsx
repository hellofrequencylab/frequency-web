import { describe, it, expect, vi, beforeEach } from 'vitest'

const caller = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () => {
    if (caller.value instanceof Error) throw caller.value
    return caller.value
  },
}))
vi.mock('../induction', () => ({ default: () => null }))

import FunnelInductionPreviewPage, { metadata } from './page'

describe('/join/preview is staff only', () => {
  beforeEach(() => {
    caller.value = null
  })

  it('a signed-out visitor is sent to /join', async () => {
    await expect(FunnelInductionPreviewPage()).rejects.toThrow('REDIRECT:/join')
  })

  it('a member (and a community host) is sent to /join', async () => {
    for (const webRole of ['member', null]) {
      caller.value = { id: 'p1', webRole, community_role: 'host' }
      await expect(FunnelInductionPreviewPage()).rejects.toThrow('REDIRECT:/join')
    }
  })

  it('a failed lookup fails closed', async () => {
    caller.value = new Error('db down')
    await expect(FunnelInductionPreviewPage()).rejects.toThrow('REDIRECT:/join')
  })

  it('admin and janitor see the preview', async () => {
    for (const webRole of ['admin', 'janitor']) {
      caller.value = { id: 'p1', webRole, community_role: 'member' }
      const el = await FunnelInductionPreviewPage()
      expect(el.props.preview).toBe(true)
    }
  })

  it('is noindex', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
