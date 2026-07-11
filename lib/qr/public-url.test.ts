import { describe, it, expect } from 'vitest'
import { publicUrlFor, publicShareUrl, SAFE_FALLBACK } from './public-url'

describe('publicUrlFor', () => {
  it('leaves a public entity detail page untouched', () => {
    expect(publicUrlFor('/events/sunset-jam')).toBe('/events/sunset-jam')
    expect(publicUrlFor('/spaces/the-lab')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/people/dana')).toBe('/people/dana')
  })

  it('strips an owner/admin suffix back to the entity public page (the reported leak)', () => {
    expect(publicUrlFor('/events/sunset-jam/manage')).toBe('/events/sunset-jam')
    expect(publicUrlFor('/events/sunset-jam/settings')).toBe('/events/sunset-jam')
    expect(publicUrlFor('/events/sunset-jam/edit')).toBe('/events/sunset-jam')
    expect(publicUrlFor('/spaces/the-lab/manage')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/spaces/the-lab/settings')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/spaces/the-lab/crm')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/spaces/the-lab/edit-page')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/circles/skaters/settings')).toBe('/circles/skaters')
  })

  it('collapses a nested public sub-page to the entity root', () => {
    expect(publicUrlFor('/spaces/the-lab/book')).toBe('/spaces/the-lab')
    expect(publicUrlFor('/spaces/the-lab/menu')).toBe('/spaces/the-lab')
  })

  it('never emits an admin console, and falls back to the safe public default', () => {
    expect(publicUrlFor('/admin/qr')).toBe(SAFE_FALLBACK)
    expect(publicUrlFor('/admin/spaces/123')).toBe(SAFE_FALLBACK)
    expect(publicUrlFor('/admin')).toBe(SAFE_FALLBACK)
  })

  it('never resolves a QR to the private member feed', () => {
    expect(publicUrlFor('/feed')).toBe(SAFE_FALLBACK)
    expect(publicUrlFor('/feed/anything')).toBe(SAFE_FALLBACK)
  })

  it('accepts an absolute URL and returns a root-relative public path', () => {
    expect(publicUrlFor('https://app.example.com/events/sunset-jam/manage')).toBe('/events/sunset-jam')
    expect(publicUrlFor('https://app.example.com/admin/qr')).toBe(SAFE_FALLBACK)
  })

  it('drops query + hash from a bare path', () => {
    expect(publicUrlFor('/events/sunset-jam/manage?tab=stats')).toBe('/events/sunset-jam')
    expect(publicUrlFor('/discover?near=me#top')).toBe('/discover')
  })

  it('keeps a non-entity public page as-is when it carries no admin segment', () => {
    expect(publicUrlFor('/discover')).toBe('/discover')
    expect(publicUrlFor('/discover/events')).toBe('/discover/events')
    expect(publicUrlFor('/')).toBe('/')
  })

  it('handles empty / malformed input safely', () => {
    expect(publicUrlFor('')).toBe('/')
    expect(publicUrlFor('   ')).toBe('/')
    expect(publicUrlFor('events/sunset-jam/manage')).toBe('/events/sunset-jam')
  })
})

describe('publicShareUrl', () => {
  it('joins the origin to the resolved public path', () => {
    expect(publicShareUrl('https://freq.app', '/events/sunset-jam/manage')).toEqual({
      path: '/events/sunset-jam',
      url: 'https://freq.app/events/sunset-jam',
    })
  })

  it('routes an admin route through the safe fallback', () => {
    expect(publicShareUrl('https://freq.app', '/admin/qr')).toEqual({
      path: SAFE_FALLBACK,
      url: `https://freq.app${SAFE_FALLBACK}`,
    })
  })
})
