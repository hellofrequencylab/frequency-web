import { describe, it, expect, vi } from 'vitest'

// The commit registry's admission criteria, locked (ADR-998).
//
// The registry is what lets a GENERIC surface finish a proposal, so its danger is obvious: one
// careless row and the tool layer becomes a second authority over an entity's own gate, which
// ADR-988 §4 exists to prevent. These tests hold the two criteria and the completeness rule.
//
// `lib/circles/draft.ts` is stubbed: it reaches the Supabase admin client at import, and nothing
// here is testing the Circle writer. What is being tested is the SHAPE of the registry.
vi.mock('@/lib/circles/draft', () => ({
  createBlankCircleDraft: vi.fn(async () => ({ circleId: 'c1', slug: 'sunrise-swim' })),
}))

import { committableEntities, createCommitFor, hasCreateCommit, NO_COMMIT_REASON } from './create-commits'
import { CREATE_GATES, creatableEntityIds } from './create-tools'

describe('the commit registry', () => {
  it('only registers entities whose gate is a CAPABILITY gate', () => {
    // A `scoped` authority (a Space plan limit, a per-Space role ladder, a seller gate) is enforced
    // by the entity's own action. A commit invoked from the drafts surface would skip it, so a
    // scoped entity may never be registered here.
    for (const entity of committableEntities()) {
      expect(CREATE_GATES[entity]?.kind, entity).toBe('capability')
    }
  })

  it('is total: an unknown or catalog-only id resolves to no commit rather than throwing', () => {
    expect(hasCreateCommit('channel')).toBe(false)
    expect(hasCreateCommit('not-a-thing')).toBe(false)
    expect(createCommitFor('not-a-thing')).toBeNull()
  })

  // The completeness rule: every creatable entity either CAN be finished here or SAYS WHY NOT.
  // Adding a manifest without doing one of the two would leave a member staring at a draft with
  // no button and no explanation.
  it('every creatable entity either has a commit or a stated reason it has none', () => {
    for (const entity of creatableEntityIds()) {
      const answered = hasCreateCommit(entity) || typeof NO_COMMIT_REASON[entity] === 'string'
      expect(answered, `${entity} has neither a registered commit nor a NO_COMMIT_REASON`).toBe(true)
    }
  })

  it('no entity both has a commit and claims it does not', () => {
    for (const entity of committableEntities()) {
      expect(NO_COMMIT_REASON[entity], entity).toBeUndefined()
    }
  })

  it('every stated reason is plain member-facing copy, with no em dashes', () => {
    for (const [entity, why] of Object.entries(NO_COMMIT_REASON)) {
      expect(why, entity).not.toMatch(/—/)
      expect(why.length, entity).toBeGreaterThan(30)
    }
  })

  it('the Circle commit maps the manifest draft onto the writer and returns its builder', async () => {
    const { createBlankCircleDraft } = await import('@/lib/circles/draft')
    const commit = createCommitFor('circle')
    expect(commit).not.toBeNull()
    const res = await commit!({
      entity: 'circle',
      draft: { name: 'Sunrise Swim', about: 'A cold dip before work.', primaryPillar: 'body' },
      actorProfileId: 'p1',
      spaceId: null,
      proposalId: 'a1',
    })
    expect(res.href).toBe('/circles/sunrise-swim/edit')
    const call = vi.mocked(createBlankCircleDraft).mock.calls[0][0]
    expect(call.profileId).toBe('p1')
    expect(call.name).toBe('Sunrise Swim')
    // The Circle's About is the spark's `oneLiner` — the same bridge the wizard makes.
    expect(call.spark?.oneLiner).toBe('A cold dip before work.')
    expect(call.spark?.primaryPillar).toBe('body')
  })

  it('refuses to smuggle a bogus Pillar through the draft', async () => {
    const commit = createCommitFor('circle')!
    await commit({
      entity: 'circle',
      draft: { name: 'X', primaryPillar: 'chaos' },
      actorProfileId: 'p1',
      spaceId: null,
      proposalId: 'a2',
    })
    const { createBlankCircleDraft } = await import('@/lib/circles/draft')
    const last = vi.mocked(createBlankCircleDraft).mock.calls.at(-1)![0]
    expect(last.spark?.primaryPillar).toBeNull()
  })
})
