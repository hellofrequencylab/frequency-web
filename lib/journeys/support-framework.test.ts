import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/pillars', () => ({ getPillars: vi.fn() }))
vi.mock('@/lib/ai/journey-composition', () => ({ draftJourneyComposition: vi.fn() }))
import { masterFrameworkToBlocks, MASTER_FRAMEWORK } from './templates'

const pillars = { mind: 'm', body: 'b', spirit: 's', expression: 'e' }

describe('framework entry and authoring guidance coherence', () => {
  it.each([false, true])('keeps one anchor and optional supports across the real framework fixed=%s', (fixed) => {
    const blocks = masterFrameworkToBlocks(pillars, { weeks: 3, fixed })
    const rows = blocks.flatMap((block) => block.block.kind === 'block' ? [block.block.row] : [])
    expect(rows.filter((row) => (row.settings as { anchor?: boolean } | null)?.anchor)).toHaveLength(1)
    expect(rows.filter((row) => row.block_type === 'practice' && row.domain_id).every((row) => row.required === false)).toBe(true)
    expect(rows.filter((row) => row.domain_id === 'e')).toHaveLength(4)
    expect(rows.filter((row) => row.domain_id === 'e').every((row) => row.required === false)).toBe(true)
    expect(blocks.filter((block) => block.block.kind === 'phase')).toHaveLength(5)
    expect(MASTER_FRAMEWORK.description).toMatch(/optional/)
  })
  it('keeps the review rubric invitational without changing current official reward facts', () => {
    const rubric = readFileSync('content/leader-training/authoring/how-to-create-a-journey.md', 'utf8')
    expect(rubric).toContain('not four daily quotas')
    expect(rubric).toContain('do not have to achieve harmony before they express themselves')
    expect(rubric).toContain('keep expression private')
    expect(rubric).toContain('not reward amounts or existing completion contracts')
    expect(rubric).toContain('+75 Zaps and a Pillar Trophy')
    expect(rubric).toContain('+50 Zaps in person at a Circle, or +30 Gems posted solo online')
    expect(rubric).not.toContain('Every week carries all four Pillars evenly')
    expect(rubric).not.toContain('Do not cut it')
  })
})
