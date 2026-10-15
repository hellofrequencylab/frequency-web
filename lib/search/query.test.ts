import { expect, it } from 'vitest'
import { searchTerms, applySearchTerms, searchRows } from './query'
it('bounds input and escapes grammar and SQL wildcards', () => {
  expect(searchTerms('  morning   movement ')).toEqual(['morning', 'movement'])
  expect(searchTerms('100% a_b')).toEqual(['100\\%', 'a\\_b'])
  expect(searchTerms('x),visibility.eq.private')).toEqual(['x', 'visibility.eq.private'])
  expect(searchTerms('é')).toEqual(searchTerms('e\u0301'))
  expect(searchTerms('x'.repeat(100))[0]).toHaveLength(80)
})
it('ANDs terms over ORed fields and never mutates a shared request builder', () => {
  const filters: string[] = []
  const builder = { or: (q: string) => { filters.push(q); return builder } }
  applySearchTerms(builder, ['title', 'description'], 'thursday thrive')
  expect(filters).toEqual(['title.ilike.%thursday%,description.ilike.%thursday%', 'title.ilike.%thrive%,description.ilike.%thrive%'])
})
it('distinguishes a successful empty response from provider failure', () => {
  expect(searchRows({ data: null }, 'people')).toEqual([])
  expect(() => searchRows({ data: null, error: { code: '42703' } }, 'people')).toThrow('Search provider unavailable: people')
})
