import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  permanentRedirect: vi.fn(),
}))
vi.mock('@/lib/spaces/store', () => ({ getSpaceByDomain: vi.fn() }))
vi.mock('@/lib/sites/site-cache', () => ({ getSiteSpace: vi.fn() }))
vi.mock('@/lib/sites/site-domain', () => ({ liveSiteDomain: vi.fn() }))

import { redirectChapterToSpacePage } from './hosted'
import type { Space } from '@/lib/spaces/types'

const chapter = (over: Partial<Space> = {}): Space => ({ slug: 'the-group-encinitas', parentId: 'n', domain: null, preferences: {}, ...over }) as Space

describe('a chapter address shows its Space page (LIVE-1289)', () => {
  it('sends an unpublished chapter to its Space page', async () => {
    await expect(redirectChapterToSpacePage('encinitas.thegrouplocal.com', chapter(), '/')).rejects.toThrow(/redirect:.*\/spaces\/the-group-encinitas$/)
  })
  it('keeps the subpath', async () => {
    await expect(redirectChapterToSpacePage('encinitas.thegrouplocal.com', chapter(), '/calendar')).rejects.toThrow(/\/spaces\/the-group-encinitas\/calendar$/)
  })
  it('serves a chapter that published its own website', async () => {
    await expect(redirectChapterToSpacePage('encinitas.thegrouplocal.com', chapter({ preferences: { websitePublished: true } }), '/')).resolves.toBeUndefined()
  })
  it('leaves a Space that is not a chapter, and a chapter on its own domain, alone', async () => {
    await expect(redirectChapterToSpacePage('shop.example.com', chapter({ parentId: null }), '/')).resolves.toBeUndefined()
    await expect(redirectChapterToSpacePage('shop.example.com', chapter({ domain: 'shop.example.com' }), '/')).resolves.toBeUndefined()
  })
})
