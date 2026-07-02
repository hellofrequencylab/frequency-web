import { describe, it, expect } from 'vitest'
import { spaceCrumbs } from './owner-nav'

const S = '/spaces/willow'
const crumbs = (path: string, manageHref = `${S}/manage`) =>
  spaceCrumbs(path, 'willow', 'Willow Studio', manageHref).map((c) => `${c.label}@${c.href}`)

describe('spaceCrumbs', () => {
  it('the profile itself is Spaces > brandName', () => {
    expect(crumbs(S)).toEqual(['Spaces@/spaces/directory', 'Willow Studio@/spaces/willow'])
  })

  it('nests the manage hub + its sub-pages under Manage', () => {
    expect(crumbs(`${S}/manage`)).toEqual([
      'Spaces@/spaces/directory',
      'Willow Studio@/spaces/willow',
      'Manage@/spaces/willow/manage',
    ])
    expect(crumbs(`${S}/manage/mode`).at(-1)).toBe('Mode@/spaces/willow/manage/mode')
    expect(crumbs(`${S}/manage/layout`).at(-1)).toBe('Page@/spaces/willow/manage/layout')
  })

  it('nests settings sections directly under Manage (skips the redirecting /settings index)', () => {
    const billing = crumbs(`${S}/settings/billing`)
    expect(billing).toEqual([
      'Spaces@/spaces/directory',
      'Willow Studio@/spaces/willow',
      'Manage@/spaces/willow/manage',
      'Billing@/spaces/willow/settings/billing',
    ])
    // members reads as People; the /settings index alone collapses to Manage
    expect(crumbs(`${S}/settings/members`).at(-1)).toBe('People@/spaces/willow/settings/members')
    expect(crumbs(`${S}/settings`)).toEqual([
      'Spaces@/spaces/directory',
      'Willow Studio@/spaces/willow',
      'Manage@/spaces/willow/manage',
    ])
  })

  it('points the Manage crumb at the type-correct hub (root/coaching use /settings)', () => {
    // A non-console type whose hub is /settings: the middle rung is that hub, never a redirect hop.
    expect(crumbs(`${S}/settings/billing`, `${S}/settings`).at(2)).toBe('Manage@/spaces/willow/settings')
  })

  it('handles crm, book, and a custom page', () => {
    expect(crumbs(`${S}/crm`).at(-1)).toBe('CRM@/spaces/willow/crm')
    expect(crumbs(`${S}/book`).at(-1)).toBe('Book@/spaces/willow/book')
    expect(crumbs(`${S}/classes`).at(-1)).toBe('Classes@/spaces/willow/classes')
  })

  it('returns no trail for the full-width editor', () => {
    expect(spaceCrumbs(`${S}/edit-page`, 'willow', 'Willow Studio', `${S}/manage`)).toEqual([])
  })
})
