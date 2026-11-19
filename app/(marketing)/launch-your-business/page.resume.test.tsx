import { beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ active: vi.fn(), entry: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'owner' }))
vi.mock('@/lib/launch/entry-io', () => ({ ownedWizardEntry: io.entry }))
vi.mock('@/lib/launch/store', () => ({ getActiveLaunch: io.active }))
vi.mock('@/components/frequency/site/pages/create-space/create-space-studio', () => ({ CreateSpaceStudio: () => null }))
vi.mock('@/components/frequency/site/pages/create-space/create-space-sections', () => ({ Closing: () => null, DayOne: () => null, FreeToOperate: () => null, Questions: () => null, SoundFamiliar: () => null }))
import CreateASpacePage from './page'
beforeEach(() => { io.entry.mockResolvedValue(null); io.active.mockResolvedValue(null) })
describe('canonical launch phase entry', () => {
  it('does not reopen a handed-over launch as a builder through new=1', async () => {
    io.active.mockResolvedValue({ spaceId: null, resume: { phase: 'launch' } })
    await expect(CreateASpacePage({ searchParams: Promise.resolve({ new: '1' }) })).rejects.toThrow('redirect:/launch')
  })
  it('opens the builder for an explicit new request without an active handover', async () => {
    await expect(CreateASpacePage({ searchParams: Promise.resolve({ new: '1' }) })).resolves.toBeTruthy()
  })
})
