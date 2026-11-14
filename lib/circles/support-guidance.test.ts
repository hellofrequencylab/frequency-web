import { describe, expect, it, vi } from 'vitest'
import { standardCalloutsFor } from './templates'
import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { DEFAULT_LAYOUT, WIDGET_META } from '@/lib/journey-page-config'

vi.mock('@/lib/ai/spark', () => ({ defineSpark: (spec: unknown) => spec, runSpark: vi.fn(), sparkStr: vi.fn(), sparkStrArray: vi.fn() }))
vi.mock('@/lib/ai/writing-coach', () => ({ writingCoach: vi.fn(), WRITING_QUESTIONS: [], parseWritingQuestions: vi.fn() }))
import { CIRCLE_SPARK } from '@/lib/ai/circle-spark'

describe('Circle support is optional authored context', () => {
  it('invites overlapping supports and leaving irrelevant areas blank', () => {
    const callout = standardCalloutsFor('pillars')[0]
    expect(callout.title).toBe('Choose what this Circle can support')
    expect(callout.body).toMatch(/overlap/)
    expect(callout.body).toMatch(/optional/)
    expect(callout.body).toMatch(/leave other areas blank/)
    expect(callout.body).not.toMatch(/carry all four|whole person/)
  })
  it('keeps the existing optional fields and paths without mandatory coverage', () => {
    const section = CIRCLE_MANIFEST.sections.find(section => section.key === 'pillars')!
    expect(section.title).toBe('What this Circle can support')
    expect(section.desc).toMatch(/Optional/)
    const fields = CIRCLE_MANIFEST.fields.filter(field => field.path.startsWith('pillarsInside.'))
    expect(fields.map(field => field.path)).toEqual(['pillarsInside.mind', 'pillarsInside.body', 'pillarsInside.spirit', 'pillarsInside.expression'])
    expect(fields.every(field => !field.required)).toBe(true)
    expect(CIRCLE_MANIFEST.fields.find(field => field.path === 'primaryPillar')).toMatchObject({ label: 'Main focus (optional)' })
  })
  it('asks only for host-supplied support notes without changing the tool schema', () => {
    const schema = CIRCLE_SPARK.tool.input_schema
    expect(schema.required).toEqual(['name', 'card', 'one_liner', 'identity'])
    const support = schema.properties!.pillars_inside as { description: string; properties: Record<string, { description: string }> }
    expect(support.description).toMatch(/Leave unspecified areas empty; do not invent coverage/)
    expect(Object.keys(support.properties)).toEqual(['mind', 'body', 'spirit', 'expression'])
    for (const field of Object.values(support.properties)) expect(field.description).toMatch(/optional host-supplied.*otherwise empty/)
  })
  it('retains stored discovery configuration while naming its actual count unit', () => {
    expect(DEFAULT_LAYOUT.discovery).toContain('pillar-balance')
    expect(WIDGET_META['pillar-balance']).toMatchObject({ label: 'Path categories', mode: 'discovery' })
    expect(WIDGET_META['pillar-balance'].hint).toMatch(/Primary category labels assigned to path items/)
    expect(WIDGET_META['pillar-balance'].hint).toMatch(/not a personal balance score/)
  })
})
