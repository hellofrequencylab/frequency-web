import { describe, expect, it } from 'vitest'
import { normalizeWebsiteFields } from './website-fields'

describe('website theme field compatibility', () => {
  it.each([['Heading', 'title', 'text'], ['DisplayHeading', 'text', 'title'], ['Text', 'body', 'text'], ['Prose', 'text', 'body']])('preserves legacy %s copy without retaining a conflicting alias', (type, canonical, legacy) => {
    const block = { type, props: { id: 'copy', [legacy]: 'Actual authored copy' } }
    const original = structuredClone(block)
    const normalized = normalizeWebsiteFields(block)
    expect(normalized.props[canonical]).toBe('Actual authored copy')
    expect(normalized.props[legacy]).toBeUndefined()
    expect(block).toEqual(original)
  })
  it('preserves an intentionally empty canonical field over an old alias', () => {
    expect(normalizeWebsiteFields({ type: 'Text', props: { body: '', text: 'Old copy' } }).props.body).toBe('')
  })
})
