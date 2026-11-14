import { beforeEach, expect, it, vi } from 'vitest'

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound, redirect: vi.fn(() => { throw new Error('REDIRECT') }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'staff-1' }))
vi.mock('@/components/hunts/staff-proof-screens', () => ({ HuntStaffScanScreen: () => null }))
vi.mock('@/components/hunts/staff-scan-form', () => ({ StaffScanForm: () => null }))

beforeEach(() => {
  vi.unstubAllEnvs()
  notFound.mockClear()
})

it('404s while HUNTS_CLAIMS_ENABLED is off', async () => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
  const { default: Page } = await import('./page')
  await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
})

it('renders once HUNTS_CLAIMS_ENABLED and HUNTS_ENABLED are on', async () => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  const { default: Page } = await import('./page')
  await expect(Page()).resolves.toBeTruthy()
  expect(notFound).not.toHaveBeenCalled()
})
