import { describe, expect, it } from 'vitest'
import { fieldTextTargets, inspectorTarget } from './field-sync'

const props = {
  title: 'Start your Friday *with good people.*',
  body: 'After a full week of building.\nA weekly ritual where conversations flow.',
  facts: [{ label: 'Where', value: 'Fox Point Farms' }, { label: 'When', value: 'Every Friday' }],
}

describe('canvas and inspector stay on the same words', () => {
  it('splits a body into the lines the canvas draws', () => {
    expect(fieldTextTargets(props, 'body')).toEqual(['After a full week of building.', 'A weekly ritual where conversations flow.'])
  })
  it('reads a heading the way the canvas compares it (voice marks dropped)', () => {
    expect(fieldTextTargets(props, 'title')).toEqual(['Start your Friday with good people.'])
  })
  it('lights one card field, or every card when the list is focused', () => {
    expect(fieldTextTargets(props, 'facts', [1, 'value'])).toEqual(['Every Friday'])
    expect(fieldTextTargets(props, 'facts')).toEqual(['Where', 'Fox Point Farms', 'When', 'Every Friday'])
  })
  it('opens the card a click came from, and lights the key inside it', () => {
    expect(inspectorTarget({ field: 'facts', path: [1, 'value'] })).toEqual({ field: 'facts', item: 1, key: 'value' })
    expect(inspectorTarget({ field: 'body', path: [] })).toEqual({ field: 'body', item: null, key: 'body' })
  })
})
