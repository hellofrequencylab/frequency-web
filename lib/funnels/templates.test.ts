import { describe, it, expect } from 'vitest'
import {
  FUNNEL_TEMPLATES,
  FUNNEL_STAGE_ORDER,
  STAGE_KIND_META,
  REF_TYPE_META,
  getFunnelTemplate,
} from './templates'
import { PERSONA_ORDER } from '@/lib/onboarding/personas'
import { getLeadFlow } from '@/lib/onboarding/lead-flows'

// Lock the seed templates (GE2-4): the four canonical stages in order, valid
// personas, and link targets that actually resolve, so a template clone can never
// wire a stage to a lead flow that does not exist.
describe('funnel templates', () => {
  it('orders the four canonical stages and gives each a meta label', () => {
    expect(FUNNEL_STAGE_ORDER).toEqual(['entry', 'wedge', 'capture', 'convert'])
    for (const kind of FUNNEL_STAGE_ORDER) {
      expect(STAGE_KIND_META[kind].label).toBeTruthy()
      expect(STAGE_KIND_META[kind].blurb).toBeTruthy()
    }
  })

  it('every template targets a valid persona and resolves by key', () => {
    for (const t of FUNNEL_TEMPLATES) {
      expect(PERSONA_ORDER).toContain(t.persona)
      expect(t.goalEvent).toBeTruthy()
      expect(getFunnelTemplate(t.key)).toEqual(t)
    }
    expect(getFunnelTemplate('nope')).toBeNull()
  })

  it('every template has exactly the four ordered stages', () => {
    for (const t of FUNNEL_TEMPLATES) {
      expect(t.stages.map((s) => s.kind)).toEqual(FUNNEL_STAGE_ORDER)
    }
  })

  it('lead-flow links point at lead flows that exist; ref types are known', () => {
    for (const t of FUNNEL_TEMPLATES) {
      for (const s of t.stages) {
        if (!s.link) continue
        expect(REF_TYPE_META[s.link.refType]).toBeDefined()
        if (s.link.refType === 'lead_flow') {
          // getLeadFlow falls back to the welcome flow on an unknown slug, so an
          // exact slug match proves the target is real, not the fallback.
          expect(getLeadFlow(s.link.refKey).slug).toBe(s.link.refKey)
        }
      }
    }
  })
})
