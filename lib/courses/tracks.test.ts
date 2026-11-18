import { describe, expect, it } from 'vitest'
import { courseHref, groupByTrack, isCourse, trackFor, type CourseCandidate } from './tracks'

const base: CourseCandidate = {
  slug: 'x',
  category: null,
  official: true,
  visibility: 'public',
  status: 'approved',
  space_id: 'hq-id',
}

describe('course tracks', () => {
  it('puts the hosting slugs on Hosting and Creator Lab on Business and leadership', () => {
    expect(trackFor({ slug: 'host-foundations', category: null })).toBe('hosting')
    expect(trackFor({ slug: 'co-host-apprenticeship', category: 'Creator Lab' })).toBe('hosting')
    expect(trackFor({ slug: 'the-business-of-community-101', category: 'Creator Lab' })).toBe('business')
    expect(trackFor({ slug: 'anything', category: 'Hosting' })).toBe('hosting')
    expect(trackFor({ slug: 'anything', category: 'Breathwork' })).toBe('other')
  })

  it('links a course with a sales page there, and every other course to its public Journey page', () => {
    expect(courseHref('the-business-of-community-101')).toBe('/courses/business-of-community')
    expect(courseHref('host-foundations')).toBe('/courses/host-foundations')
    expect(courseHref('host-foundations').startsWith('/journeys/')).toBe(false)
  })

  it('counts only official public courses that are Creator Lab or in the house Space', () => {
    expect(isCourse(base, 'hq-id')).toBe(true)
    expect(isCourse({ ...base, space_id: 'other', category: 'Creator Lab' }, 'hq-id')).toBe(true)
    expect(isCourse({ ...base, space_id: 'other' }, 'hq-id')).toBe(false)
    expect(isCourse({ ...base, official: false }, 'hq-id')).toBe(false)
    expect(isCourse({ ...base, visibility: 'unlisted' }, 'hq-id')).toBe(false)
    expect(isCourse({ ...base, status: 'rejected' }, 'hq-id')).toBe(false)
    expect(isCourse(base, null)).toBe(false)
  })

  it('groups in shelf order and drops empty shelves', () => {
    const groups = groupByTrack([
      { slug: 'host-foundations', category: 'Hosting' },
      { slug: 'the-business-of-community-101', category: 'Creator Lab' },
    ])
    expect(groups.map((g) => g.track.key)).toEqual(['business', 'hosting'])
  })
})
