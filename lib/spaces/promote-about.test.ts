import { describe, expect, it } from 'vitest'
import { takeAboutBody } from './promote-about'

describe('takeAboutBody', () => {
  it('lifts the body out of a type-keyed document and keeps the rest of the bag', () => {
    const doc = { rows: [], content: { about: { body: '  Hello  ', title: 'Mine' }, text: { text: 'x' } } }
    const out = takeAboutBody(doc)
    expect(out.body).toBe('Hello')
    expect(out.layout).toEqual({ rows: [], content: { about: { title: 'Mine' }, text: { text: 'x' } } })
    expect(doc.content.about.body).toBe('  Hello  ')
  })

  it('lifts the body out of an About node in rows or the bench', () => {
    const node = { nid: 'a', type: 'about', content: { body: 'Hi' } }
    const out = takeAboutBody({ rows: [{ id: 'r', cells: [[node]] }], bench: [] })
    expect(out.body).toBe('Hi')
    expect(JSON.stringify(out.layout)).not.toContain('Hi')
  })

  it('leaves a layout with no typed body untouched', () => {
    const doc = { content: { about: { title: 'Only a title' } } }
    expect(takeAboutBody(doc)).toEqual({ body: null, layout: doc })
  })
})
