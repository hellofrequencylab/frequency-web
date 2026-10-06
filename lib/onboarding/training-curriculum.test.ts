import { describe, it, expect } from 'vitest'
import {
  TRAINING,
  TRAINING_TIERS,
  curriculumForPromotion,
  hasCurriculum,
  helpCurriculumSteps,
  helpHref,
  tierCurriculumViews,
  normalizeCurriculumEdit,
  parseCurriculumOverrides,
  applyCurriculumOverrides,
  doneStepIds,
  stepIdFrom,
  isInternalHref,
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
    { category: 'sharing', slug: 'dispatches', title: 'Dispatches', order: 1, role: 'host' },
    { category: 'groups', slug: 'hubs', title: 'Hubs', order: 1, role: 'guide' },
    { category: 'getting-started', slug: 'welcome', title: 'Welcome', order: 1 }, // untagged
    { category: 'groups', slug: 'draft', title: 'Draft', order: 0, role: 'host', status: 'draft' },
  ]

  it('selects only published articles tagged for the role, ordered by `order`', () => {
    const steps = helpCurriculumSteps(articles, 'host')
    expect(steps.map((s) => s.label)).toEqual(['Dispatches', 'Channels', 'Events & RSVPs'])
    expect(steps[0].href).toBe('/help/sharing/dispatches')
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
    expect(steps).toEqual([{ id: 'groups-hubs', label: 'Hubs', href: '/help/groups/hubs' }])
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
    expect(host.taggedSteps).toEqual([{ id: 'groups-events', label: 'Events', href: '/help/groups/events' }])
    const mentor = views.find((v) => v.role === 'mentor')!
    expect(mentor.taggedSteps).toEqual([])
    expect(mentor.def).not.toBeNull()
  })
})

describe('in-place curriculum edits (LIVE-690)', () => {
  const host = TRAINING.host!

  it('gives every registry step an id that is unique within its tier', () => {
    for (const role of TRAINING_TIERS) {
      const ids = TRAINING[role]!.steps.map((s) => s.id)
      expect(new Set(ids).size, role).toBe(ids.length)
      for (const id of ids) expect(id, role).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    }
  })

  it('keeps a valid step id through a relabel and mints one for a new step', () => {
    const r = normalizeCurriculumEdit({
      title: ' Host basics ',
      blurb: 'Run your first circle.',
      steps: [
        { id: 'events', label: 'Plan your first event', href: '/help/groups/events' },
        { label: 'Say hello', href: '/help/groups/hello' },
        { id: 'events', label: 'Events again', href: '/help/groups/events' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.edit.title).toBe('Host basics')
    expect(r.edit.steps.map((s) => s.id)).toEqual(['events', 'say-hello', 'events-again'])
  })

  it('refuses an empty path, a missing label and an outside link', () => {
    expect(normalizeCurriculumEdit({ title: 'x', blurb: '', steps: [] }).ok).toBe(false)
    expect(normalizeCurriculumEdit({ title: '', blurb: '', steps: [{ label: 'a', href: '/a' }] }).ok).toBe(false)
    expect(normalizeCurriculumEdit({ title: 'x', blurb: '', steps: [{ label: '', href: '/a' }] }).ok).toBe(false)
    for (const href of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/a b', '']) {
      expect(normalizeCurriculumEdit({ title: 'x', blurb: '', steps: [{ label: 'a', href }] }).ok, href).toBe(false)
    }
    const many = Array.from({ length: 13 }, (_, i) => ({ label: `s${i}`, href: '/a' }))
    expect(normalizeCurriculumEdit({ title: 'x', blurb: '', steps: many }).ok).toBe(false)
  })

  it('accepts only site paths as links', () => {
    expect(isInternalHref('/help/groups/events')).toBe(true)
    expect(isInternalHref('//x')).toBe(false)
    expect(isInternalHref('help')).toBe(false)
  })

  it('suffixes a minted id that is already taken', () => {
    expect(stepIdFrom('Run events!', new Set(['run-events']))).toBe('run-events-2')
    expect(stepIdFrom('***', new Set())).toBe('step')
  })

  it('reads stored edits fail-safe: bad JSON, unknown rungs and invalid tiers drop out', () => {
    expect(parseCurriculumOverrides('not json')).toEqual({})
    expect(parseCurriculumOverrides('')).toEqual({})
    const o = parseCurriculumOverrides(
      JSON.stringify({
        host: { title: 'Edited', blurb: 'b', steps: [{ id: 'events', label: 'E', href: '/help/groups/events' }] },
        guide: { title: '', blurb: '', steps: [] },
        admin: { title: 'x', blurb: '', steps: [{ label: 'a', href: '/a' }] },
      }),
    )
    expect(Object.keys(o)).toEqual(['host'])
  })

  it('lays an edit over the registry and keeps the reward from code', () => {
    const defs = applyCurriculumOverrides(TRAINING, {
      host: { title: 'Edited', blurb: 'b', steps: [{ id: 'events', label: 'E', href: '/help/groups/events' }] },
    })
    expect(defs.host).toMatchObject({ role: 'host', title: 'Edited', reward: host.reward })
    expect(defs.host!.steps).toHaveLength(1)
    expect(defs.crew).toBe(TRAINING.crew)
    expect(applyCurriculumOverrides(TRAINING, {})).toEqual(TRAINING)
  })

  it('counts only finished steps that are still on the path', () => {
    expect(doneStepIds(host.steps, ['events', 'gone', 'hubs'])).toEqual(['events', 'hubs'])
    expect(doneStepIds(host.steps, null)).toEqual([])
  })

  it('lets the authoring view read the edited curriculum', () => {
    const defs = applyCurriculumOverrides(TRAINING, {
      host: { title: 'Edited', blurb: 'b', steps: [{ id: 'events', label: 'E', href: '/help/groups/events' }] },
    })
    expect(tierCurriculumViews([], defs).find((v) => v.role === 'host')!.def!.title).toBe('Edited')
  })
})
