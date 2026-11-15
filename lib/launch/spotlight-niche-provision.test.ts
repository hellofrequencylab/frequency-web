import { beforeEach, expect, it, vi } from 'vitest'
import { emptyDraft } from '@/lib/create-space/builder'
import { parseWizardResume } from './wizard-resume'
import type { LaunchSnapshot } from './state'
const calls = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/spaces/provision', () => ({ createSpace: calls.create }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => null, getSpaceBySlug: async () => null, patchSpacePreferences: vi.fn() }))
vi.mock('./store', () => ({ attachSpace: vi.fn(), markStepPublished: vi.fn() }))
vi.mock('./events', () => ({ recordLaunchEvent: vi.fn() }))
import { publishSpotlightStep } from './spotlight-io'
beforeEach(() => { calls.create.mockReset(); calls.create.mockResolvedValue({ error: 'Stopped after inspecting the proposed create parameters' }) })
const launch = (niche: string, modeHint?: string) => ({ id: 'launch', ownerId: 'owner', spaceId: null, niche, intents: ['events'], resume: parseWizardResume({ version: 1, phase: 'launch', cursor: 4, theme: 'new-world', accentAt: 0, niche, goals: ['donations'], modeHint, timedEntry: false, draft: { ...emptyDraft('new-world', true), niche }, leadToken: null }) } as unknown as LaunchSnapshot)
it('provisions a nonprofit mode from the canonical niche without trusting goal heuristics', async () => {
  await publishSpotlightStep('owner', launch('faith'), { name: 'Sample Community', line: 'A gathering place', link: '' })
  expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'nonprofit', modeVariant: 'donations', niche: 'faith' }))
})
it('retains an explicitly selected registered mode over the default niche mode', async () => {
  await publishSpotlightStep('owner', launch('coaches', 'business:membership'), { name: 'Sample Community', line: 'A gathering place', link: '' })
  expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'business', modeVariant: 'membership', niche: 'coaches' }))
})
