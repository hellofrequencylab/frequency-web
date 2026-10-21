import { describe, expect, it } from 'vitest'
import { operatorStartHref } from '@/lib/site'
import { parseWizardHints } from './create-wizard'

describe('the pricing calculator hand-off', () => {
  it('carries the plan, the name and the goals through signup as one safe in-app path', () => {
    const href = operatorStartHref('business', { name: 'Sunrise Yoga', intents: 'classes,events' })
    const next = new URL(href, 'https://x.test').searchParams.get('next') ?? ''
    expect(next.startsWith('/spaces/new?')).toBe(true)
    const params = new URL(next, 'https://x.test').searchParams
    expect(params.get('plan')).toBe('business')
    expect(params.get('name')).toBe('Sunrise Yoga')
    expect(params.get('intents')).toBe('classes,events')
  })
  it('drops an empty hint so the plain plan link stays plain', () => {
    expect(operatorStartHref('free', { name: '', intents: '' })).toBe(operatorStartHref('free'))
  })
  it('reads the hints back leniently', () => {
    expect(parseWizardHints({ name: '  Sunrise Yoga  ', intents: 'classes,nope,events' })).toEqual({
      name: 'Sunrise Yoga',
      intents: ['classes', 'events'],
    })
    expect(parseWizardHints({})).toEqual({ name: '', intents: [] })
    expect(parseWizardHints({ name: 'x'.repeat(200) }).name).toHaveLength(80)
  })
})
