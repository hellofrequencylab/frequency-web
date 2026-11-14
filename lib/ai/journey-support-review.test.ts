import { beforeEach, describe, expect, it, vi } from 'vitest'
const gateway = vi.hoisted(() => ({
  complete: vi.fn(), available: true, budget: false, limited: false, enabled: true,
}))
vi.mock('./complete', () => ({ completeRaw: gateway.complete }))
vi.mock('./usage', () => ({ aiAvailable: async () => gateway.available, featureOverBudget: async () => gateway.budget }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => gateway.limited }))
vi.mock('./client', () => ({ aiEnabled: () => gateway.enabled }))
import { qualityStandardFor, runQualityGate } from './quality-gate'

beforeEach(() => {
  vi.clearAllMocks()
  gateway.available = true; gateway.budget = false; gateway.limited = false; gateway.enabled = true
  gateway.complete.mockResolvedValue({ content: [{ type: 'tool_use', name: 'submit_quality_review', input: { verdict: 'approved', score: 85, feedback: ['The intention and first action are clear.'] } }] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('actual Journey rank-review prompt follows the support strategy', () => {
  it('passes an intention-based rubric and guidance to the real gateway boundary without four-area quotas', async () => {
    const standard = qualityStandardFor('journey')
    expect((await runQualityGate(standard, 'A one-week Body-focused recovery rhythm.')).status).toBe('approved')
    const request = gateway.complete.mock.calls[0][0]
    expect(request.system).toContain('Do not require equal Pillar coverage')
    expect(request.system).toContain('Expression can be private and optional')
    expect(request.system).not.toContain('A Journey that ignores the standard does not pass')
    expect(request.system).not.toContain('a heavy capstone Expression Challenge at the Close')
    expect(request.accounting).toEqual({ feature: 'journey-review' })
    expect(request.tier).toBe('opus')
    expect(request.cacheSystem).toBe(true)
    expect(request.toolChoice).toEqual({ type: 'tool', name: 'submit_quality_review' })
    expect(standard.passScore).toBe(70)
  })
  it('keeps the same supportive criteria if the file rubric is unavailable', async () => {
    const standard = { ...qualityStandardFor('journey'), rubricFile: 'nonexistent-journey-support-rubric-for-test.md' }
    await runQualityGate(standard, 'One anchor, an optional support practice, and room to adapt.')
    const system = gateway.complete.mock.calls[0][0].system as string
    expect(system).toContain('Expression can be private and optional')
    expect(standard.fallbackRubric).not.toContain('five practices')
    expect(standard.fallbackRubric).not.toContain('five-minute floor')
    expect(standard.fallbackRubric).not.toContain('a capstone that pushes')
  })
  it('retains the numeric score floor rather than auto-approving the new philosophy', async () => {
    gateway.complete.mockResolvedValue({ content: [{ type: 'tool_use', name: 'submit_quality_review', input: { verdict: 'approved', score: 69, feedback: ['Clarify the first action.'] } }] })
    expect((await runQualityGate(qualityStandardFor('journey'), 'My draft')).status).toBe('rejected')
  })
  it.each(['available', 'budget', 'limited', 'enabled'] as const)('retains the fail-closed %s gate without dispatch', async (gate) => {
    if (gate === 'available' || gate === 'enabled') gateway[gate] = false
    else gateway[gate] = true
    expect((await runQualityGate(qualityStandardFor('journey'), 'My draft')).status).toBe('pending')
    expect(gateway.complete).not.toHaveBeenCalled()
  })
})
