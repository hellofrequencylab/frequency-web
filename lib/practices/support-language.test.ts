import { describe, expect, it } from 'vitest'
import { PRACTICE_SUPPORT_COPY, PRACTICE_SUPPORT_GUIDANCE, VERA_PRACTICE_SUPPORT_GUIDANCE } from './support-language'
import { TERM_PRESETS, DEFAULT_TERM_WEEKS, ACTIVE_PRACTICE_CAP, coerceTermWeeks, termWindow } from './adoption'
import { withPracticeShape } from '@/lib/ai/practice-shape'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { PRACTICE_RAIL } from '@/components/admin/modules/practice-rail-plan'

describe('support and reward language are separate', () => {
  it('permits overlap while preserving closed primary-only output contracts', () => {
    const prompt = withPracticeShape('Return only the existing primary field. The author keeps their words.')
    expect(prompt).toContain(PRACTICE_SUPPORT_GUIDANCE)
    expect(prompt).toContain('several Pillars')
    expect(prompt).toContain('structured field accepts one primary Pillar')
    expect(prompt).toContain('Never invent extra output fields')
    expect(prompt).toContain('The author writes and saves their own words')
    expect(prompt.endsWith('Return only the existing primary field. The author keeps their words.')).toBe(true)
    expect(prompt).not.toContain('belongs to one of four Pillars')
  })
  it('offers rest, private expression and an explicit refusal of inferred wellbeing', () => {
    expect(VERA_PRACTICE_SUPPORT_GUIDANCE).toContain('Rest, continuing something familiar, declining, or changing direction')
    expect(VERA_PRACTICE_SUPPORT_GUIDANCE).toContain('private and never requires prior balance')
    expect(VERA_PRACTICE_SUPPORT_GUIDANCE).toContain('Never infer wellbeing, spirituality, or a personal deficiency')
    expect(VERA_PRACTICE_SUPPORT_GUIDANCE).toContain('existing confirmation and permission rules')
    expect(VERA_PRACTICE_SUPPORT_GUIDANCE).toContain('not an assumed diagnosis')
  })
  it('keeps the existing manifest paths and rail controls while explaining reward attribution', () => {
    const fields = new Map(PRACTICE_MANIFEST.fields.map(f => [f.path, f]))
    expect(fields.get('secondary_domain_id')).toMatchObject({ label: PRACTICE_SUPPORT_COPY.secondaryRewardLabel, kind: 'reference', optionsFrom: 'pillars', veraDrafts: false })
    expect(fields.get('primary_pct')).toMatchObject({ label: PRACTICE_SUPPORT_COPY.primaryRewardLabel, kind: 'number', veraDrafts: false })
    expect(PRACTICE_SUPPORT_COPY.allocationHint).toContain('does not change the total reward or measure wellbeing')
    expect(PRACTICE_RAIL.settings.fields).toContain(fields.get('primary_pct'))
    expect(PRACTICE_RAIL.settings.fields).toContain(fields.get('secondary_domain_id'))
  })
  it('makes no permanence promise and preserves all term values, defaults and limits', () => {
    expect(TERM_PRESETS.map(p => p.weeks)).toEqual([2, 4, 8, null])
    expect(TERM_PRESETS[2].hint).toBe('Build a rhythm over eight weeks.')
    expect(TERM_PRESETS[2].hint).not.toMatch(/for good|guaranteed|permanent/i)
    expect(DEFAULT_TERM_WEEKS).toBe(4)
    expect(ACTIVE_PRACTICE_CAP).toBe(5)
    expect(coerceTermWeeks('8')).toBe(8)
    expect(termWindow('2026-11-14', 8)).toEqual({ startsOn: '2026-11-14', endsOn: '2027-01-08' })
  })
  it('uses plain member copy without punctuation or outcome guarantees', () => {
    for (const text of [...Object.values(PRACTICE_SUPPORT_COPY), PRACTICE_SUPPORT_GUIDANCE, VERA_PRACTICE_SUPPORT_GUIDANCE]) {
      expect(text).not.toMatch(/—|guaranteed|you will feel|transform your life/i)
    }
  })
})
