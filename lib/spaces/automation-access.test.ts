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
  AUTOMATION_FEATURE,
  automationWallLabel,
  automationWallSentence,
  resolveAutomationWall,
} from './automation-access'

describe('automationWallSentence (LIVE-432)', () => {
  it('names the wall, never a retired plan', () => {
    expect(automationWallSentence(SPACE_PLAN_LABEL.business, true)).toBe(
      'Automations come with Business. Sequences and rules run your follow-ups for you.',
    )
    expect(automationWallSentence(SPACE_PLAN_LABEL.business, false)).toBe(
      'Automations come with Business. Ask an admin about the plan for this space.',
    )
    expect(automationWallSentence(SPACE_PLAN_LABEL.nonprofit, true)).toBe(
      'Automations come with Non Profit. Sequences and rules run your follow-ups for you.',
    )
    expect(automationWallSentence(SPACE_PLAN_LABEL.business, true)).not.toMatch(/Collective/)
  })
})

describe('automationWallLabel (LIVE-432)', () => {
  it('on the code default the wall word is Business', () => {
    expect(automationWallLabel()).toBe(SPACE_PLAN_LABEL.business)
  })

  it('an override that raises the wall names that plan', () => {
    expect(
      automationWallLabel({ space_automation: { minEntitlement: 'independent' } }),
    ).toBe(SPACE_PLAN_LABEL.independent)
  })
})

describe('resolveAutomationWall (LIVE-432)', () => {
  beforeEach(() => {
    vi.mocked(loadFeatureGateOverrides).mockReset()
  })

  it('reads the merged gate, not a typed plan name', async () => {
    vi.mocked(loadFeatureGateOverrides).mockResolvedValue({
      space_automation: { minEntitlement: 'nonprofit' },
    })
    await expect(resolveAutomationWall()).resolves.toBe(SPACE_PLAN_LABEL.nonprofit)
  })
})

const AUTOMATION_LOCK_FILES = [
  'app/(main)/spaces/[slug]/settings/automation/automation-body.tsx',
  'lib/spaces/automation-access.ts',
  'components/spaces/feature-locked-notice.tsx',
]

describe('automation lock screen never types Collective (LIVE-432)', () => {
  it.each(AUTOMATION_LOCK_FILES)('%s has no Collective plan leftover', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/Collective plan/)
  })

  it('the lock screen names the wall through the seam', () => {
    const src = readFileSync(
      'app/(main)/spaces/[slug]/settings/automation/automation-body.tsx',
      'utf8',
    )
    expect(src).toContain('resolveAutomationWall')
    expect(src).toContain('automationWallSentence')
    const seam = readFileSync('lib/spaces/automation-access.ts', 'utf8')
    expect(seam).toContain('featureWallLabel')
    expect(seam).toContain(`featureWallLabel(AUTOMATION_FEATURE`)
    expect(AUTOMATION_FEATURE).toBe('space_automation')
  })

  it('the catalog note for Automation does not name Collective', () => {
    const src = readFileSync('lib/admin/modules/space-modules.ts', 'utf8')
    const row = src.match(/id: 'space\.automation'[^}]+}/)
    expect(row?.[0]).toBeTruthy()
    expect(row?.[0]).not.toMatch(/Collective/)
  })
})
