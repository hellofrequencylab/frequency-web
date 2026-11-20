import { beforeEach, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ profile: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.profile }))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => true }))
vi.mock('@/lib/launch/store', () => ({ getActiveLaunch: async () => null }))
vi.mock('@/components/templates', () => ({ FocusTemplate: () => null }))
vi.mock('./create-space-wizard', () => ({ CreateSpaceWizard: () => null }))
import NewSpacePage from './page'
beforeEach(() => { io.profile.mockResolvedValue(null) })
it('carries a public niche alias into the signed-out builder with its exact mode', async () => {
  await expect(NewSpacePage({ searchParams: Promise.resolve({ niche: 'spiritual-community' }) })).rejects.toThrow('redirect:/launch-your-business?mode=nonprofit%3Adonations&niche=faith')
})
it('keeps the exact niche mode across the signed-in launch entry', async () => {
  io.profile.mockResolvedValue('owner')
  await expect(NewSpacePage({ searchParams: Promise.resolve({ niche: 'spiritual-community' }) })).rejects.toThrow('redirect:/launch/start?new=1&niche=faith&mode=nonprofit%3Adonations')
})
it('preserves a legacy explicit mode while canonicalizing a public niche alias', async () => {
  await expect(NewSpacePage({ searchParams: Promise.resolve({ niche: 'coaches-and-healers', mode: 'business:membership' }) })).rejects.toThrow('redirect:/launch-your-business?mode=business%3Amembership&niche=coaches')
})
