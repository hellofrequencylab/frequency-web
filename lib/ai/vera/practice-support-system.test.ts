import { describe, expect, it } from 'vitest'
import { buildVeraSystem } from './agent-claude'
import { DEFAULT_VERA_CONFIG } from './config'
import { VERA_PRACTICE_SUPPORT_GUIDANCE } from '@/lib/practices/support-language'

describe('Vera support guidance reaches the actual system prompt', () => {
  it('gives a returning person permission to rest and keep expression private', () => {
    const system = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    expect(system.stable).toContain(VERA_PRACTICE_SUPPORT_GUIDANCE)
    expect(system.stable).toContain('including choosing nothing right now')
    expect(system.stable).not.toContain('Then nudge, always,')
    expect(system.stable).toContain('Never infer wellbeing, spirituality, or a personal deficiency')
  })
  it('retains human authorship, confirmation, and real-person guidance', () => {
    const { stable } = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    expect(stable).toContain('Coach, do not ghostwrite')
    expect(stable).toContain('the member approves')
    expect(stable).toContain('Bridge to humans')
    expect(stable).toContain('existing confirmation and permission rules')
  })
  it('keeps the same support rules in the stable block across personal and operator context', () => {
    const member = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    const operator = buildVeraSystem(null, DEFAULT_VERA_CONFIG, 'An open support request', { isOperator: true, roleLabel: 'janitor' })
    expect(member.stable).toBe(operator.stable)
    expect(member.volatile).not.toContain('An open support request')
    expect(operator.volatile).toContain('An open support request')
  })
})
