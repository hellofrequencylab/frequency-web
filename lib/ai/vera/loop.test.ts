import { describe, it, expect } from 'vitest'
import { conciergeReply } from './concierge'
import { classifyProposals } from './loop'
import type { ProposedToolCall } from './concierge'

describe('conciergeReply', () => {
  it('greets and advances to learn, with quick replies', () => {
    const r = conciergeReply('greet', '')
    expect(r.stage).toBe('learn')
    expect(r.suggestions.length).toBeGreaterThan(0)
    expect(r.proposals).toHaveLength(0)
  })

  it('proposes remembering what the member said (propose-and-confirm)', () => {
    const r = conciergeReply('learn', 'new in town, want to meet people')
    expect(r.stage).toBe('orient')
    expect(r.proposals).toHaveLength(1)
    expect(r.proposals[0].tool).toBe('remember_fact')
    expect(r.proposals[0].args.fact).toContain('new in town')
  })

  it('proposes nothing when the member said nothing', () => {
    expect(conciergeReply('learn', '   ').proposals).toHaveLength(0)
  })

  it('ends at handoff → done, routing toward people', () => {
    expect(conciergeReply('orient', '').stage).toBe('handoff')
    const end = conciergeReply('handoff', '')
    expect(end.stage).toBe('done')
    expect(end.done).toBe(true)
  })
})

describe('classifyProposals', () => {
  it('routes valid writes to confirm, drops invalid calls', () => {
    const calls: ProposedToolCall[] = [
      { tool: 'remember_fact', args: { fact: 'loves climbing' } }, // valid write
      { tool: 'suggest_circle', args: { interest: 'climbing' } }, // valid read
      { tool: 'delete_account', args: {} }, // not in the surface → dropped
      { tool: 'set_profile_field', args: { field: 'bio' } }, // missing required value → dropped
    ]
    const { reads, writes } = classifyProposals(calls)
    expect(writes.map((w) => w.tool)).toEqual(['remember_fact'])
    expect(reads.map((r) => r.tool)).toEqual(['suggest_circle'])
  })
})
