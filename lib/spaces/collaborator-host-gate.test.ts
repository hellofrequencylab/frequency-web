import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

vi.mock('@/lib/pricing/gates', async (orig) => {
  const real = await orig<typeof import('@/lib/pricing/gates')>()
  return {
    ...real,
    loadFeatureGateOverrides: vi.fn(async () => ({})),
  }
})

import { loadFeatureGateOverrides } from '@/lib/pricing/gates'
import {
  collaboratorHostPreviewSentence,
  collaboratorHostRefusal,
  collaboratorHostWallSentence,
  resolveCollaboratorHostWall,
} from './collaborator-host-gate'

describe('collaboratorHostWallSentence (LIVE-430)', () => {
  it('names the wall, never a retired plan', () => {
    expect(collaboratorHostWallSentence(SPACE_PLAN_LABEL.business, 'space')).toBe(
      'Hosting collaborators comes with Business. Upgrade this space to invite and approve collaborators.',
    )
    expect(collaboratorHostWallSentence(SPACE_PLAN_LABEL.business, 'event-home')).toBe(
      "Collaborator hosting comes with Business. Upgrade the event's home Space to bring Collaborators on.",
    )
    expect(collaboratorHostWallSentence(SPACE_PLAN_LABEL.nonprofit, 'event-host-space')).toBe(
      "Collaborator hosting comes with Non Profit. The event's host Space needs it before this event can take on Collaborators.",
    )
    expect(collaboratorHostPreviewSentence(SPACE_PLAN_LABEL.business)).toContain('Business')
    expect(collaboratorHostWallSentence(SPACE_PLAN_LABEL.business, 'space')).not.toMatch(/Collective/)
  })
})

describe('resolveCollaboratorHostWall (LIVE-430)', () => {
  beforeEach(() => {
    vi.mocked(loadFeatureGateOverrides).mockReset()
  })

  it('on the code default the wall word is Business', async () => {
    vi.mocked(loadFeatureGateOverrides).mockResolvedValue({})
    await expect(resolveCollaboratorHostWall()).resolves.toBe(SPACE_PLAN_LABEL.business)
    await expect(collaboratorHostRefusal('space')).resolves.toBe(
      collaboratorHostWallSentence(SPACE_PLAN_LABEL.business, 'space'),
    )
  })

  it('an override that raises the wall names that plan', async () => {
    vi.mocked(loadFeatureGateOverrides).mockResolvedValue({
      space_collaborators: { minEntitlement: 'independent' },
    })
    await expect(resolveCollaboratorHostWall()).resolves.toBe(SPACE_PLAN_LABEL.independent)
  })
})

const COLLABORATOR_HOST_FILES = [
  'lib/spaces/collaborator-host-gate.ts',
  'app/(main)/spaces/[slug]/collaborations-actions.ts',
  'app/(main)/events/share-actions.ts',
  'app/(main)/spaces/[slug]/settings/collaborators/collaborators-body.tsx',
]

describe('collaborator-host writers never type Collective (LIVE-430)', () => {
  it.each(COLLABORATOR_HOST_FILES)('%s has no Collective plan leftover', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/Collective plan/)
  })

  it('the loader names the wall through featureWallLabel', () => {
    const src = readFileSync('lib/spaces/collaborator-host-gate.ts', 'utf8')
    expect(src).toContain('featureWallLabel')
    expect(src).toContain('featureWallLabel(COLLABORATOR_HOST_FEATURE')
  })
})
