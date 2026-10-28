import { describe, expect, it } from 'vitest'
import { isEmptyServicesPage } from './empty-services'

const doc = { content: [{ type: 'EditorialSection', props: {} }, { type: 'SpaceOfferings', props: {} }] }

describe('isEmptyServicesPage', () => {
  it('hides the kit Services page while no service is listed', () => {
    expect(isEmptyServicesPage('services', doc, {})).toBe(true)
    expect(isEmptyServicesPage('services', doc, { offerings: [{ title: 'Private', visibility: 'private' }] as never })).toBe(true)
  })
  it('shows it once a service is listed', () => {
    expect(isEmptyServicesPage('services', doc, { offerings: [{ title: 'Session' }] as never })).toBe(false)
  })
  it('never hides another page, or a Services page without the offerings block', () => {
    expect(isEmptyServicesPage('about', doc, {})).toBe(false)
    expect(isEmptyServicesPage('services', { content: [{ type: 'EditorialSection' }] }, {})).toBe(false)
    expect(isEmptyServicesPage('services', null, {})).toBe(false)
  })
})
