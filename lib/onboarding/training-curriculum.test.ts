import { describe, it, expect } from 'vitest'
import {
  TRAINING,
  TRAINING_TIERS,
  curriculumForPromotion,
  hasCurriculum,
  helpCurriculumSteps,
  helpHref,
  tierCurriculumViews,
  type RoleTaggedArticle,
} from './training-curriculum'

describe('curriculumForPromotion — which Journey for which promotion', () => {
  it('returns a curriculum for every tier on the trust ladder', () => {
    for (const role of TRAINING_TIERS) {
      const def = curriculumForPromotion(role)
      expect(def, role).not.toBeNull()
      expect(def!.role).toBe(role)
      expect(def!.steps.length).toBeGreaterThan(0)
    }
  })

  it('covers the full ladder member → host → guide → mentor (7.3–7.5)', () => {
    expect(hasCurriculum('host')).toBe(true)
    expect(hasCurriculum('guide')).toBe(true)
    expect(hasCurriculum('mentor')).toBe(true)
  })

  it('returns null for rungs with no advancement curriculum', () => {
    // 'member' is the entry rung (activation funnel, not a training Journey); the
    // staff rungs are a separate axis (ADR-208) and carry no community curriculum.
    expect(curriculumForPromotion('member')).toBeNull()
    expect(curriculumForPromotion('admin')).toBeNull()
    expect(curriculumForPromotion('janitor')).toBeNull()
    expect(hasCurriculum('member')).toBe(false)
  })

  it('pays an ascending reward as the rung climbs', () => {
    const rewards = TRAINING_TIERS.map((r) => TRAINING[r]!.reward)
    for (let i = 1; i < rewards.length; i++) {
      expect(rewards[i]).toBeGreaterThan(rewards[i - 1])
    }
  })
})

describe('helpCurriculumSteps — deriving a path from role-tagged help articles', () => {
  const articles: RoleTaggedArticle[] = [
    { category: 'groups', slug: 'events', title: 'Events & RSVPs', order: 3, role: 'host' },
    { category: 'groups', slug: 'channels', title: 'Channels', order: 2, role: 'host' },
    { category: 'sharing', slug: 'broadcasts', title: 'Broadcasts', order: 1, role: 'host' },
    { category: 'groups', slug: 'hubs', title: 'Hubs', order: 1, role: 'guide' },
    { category: 'getting-started', slug: 'welcome', title: 'Welcome', order: 1 }, // untagged
    { category: 'groups', slug: 'draft', title: 'Draft', order: 0, role: 'host', status: 'draft' },
  ]

  it('selects only published articles tagged for the role, ordered by `order`', () => {
    const steps = helpCurriculumSteps(articles, 'host')
    expect(steps.map((s) => s.label)).toEqual(['Broadcasts', 'Channels', 'Events & RSVPs'])
    expect(steps[0].href).toBe('/help/sharing/broadcasts')
  })

  it('excludes untagged articles (behavior-preserving for the help center)', () => {
    const steps = helpCurriculumSteps(articles, 'host')
    expect(steps.some((s) => s.href.includes('welcome'))).toBe(false)
  })

  it('excludes draft articles', () => {
    const steps = helpCurriculumSteps(articles, 'host')
    expect(steps.some((s) => s.href.includes('draft'))).toBe(false)
  })

  it('treats articles with no status as published', () => {
    const steps = helpCurriculumSteps(articles, 'guide')
    expect(steps).toEqual([{ label: 'Hubs', href: '/help/groups/hubs' }])
  })

  it('returns an empty path for a role with no tagged articles', () => {
    expect(helpCurriculumSteps(articles, 'mentor')).toEqual([])
  })

  it('breaks ties on title when `order` is equal', () => {
    const tied: RoleTaggedArticle[] = [
      { category: 'c', slug: 'b', title: 'Beta', order: 1, role: 'host' },
      { category: 'c', slug: 'a', title: 'Alpha', order: 1, role: 'host' },
    ]
    expect(helpCurriculumSteps(tied, 'host').map((s) => s.label)).toEqual(['Alpha', 'Beta'])
  })
})

describe('helpHref', () => {
  it('builds the canonical help path', () => {
    expect(helpHref('groups', 'events')).toBe('/help/groups/events')
  })
})

describe('tierCurriculumViews — the authoring surface model', () => {
  const articles: RoleTaggedArticle[] = [
    { category: 'groups', slug: 'events', title: 'Events', order: 1, role: 'host' },
  ]

  it('returns one view per tier with the registry def and tagged steps', () => {
    const views = tierCurriculumViews(articles)
    expect(views.map((v) => v.role)).toEqual([...TRAINING_TIERS])
    const host = views.find((v) => v.role === 'host')!
    expect(host.def?.role).toBe('host')
    expect(host.taggedSteps).toEqual([{ label: 'Events', href: '/help/groups/events' }])
    const mentor = views.find((v) => v.role === 'mentor')!
    expect(mentor.taggedSteps).toEqual([])
    expect(mentor.def).not.toBeNull()
  })
})
