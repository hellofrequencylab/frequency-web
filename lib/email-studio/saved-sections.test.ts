import { describe, expect, it } from 'vitest'
import { deleteSection, loadSavedSections, saveSection } from './saved-sections'

const SAVED_SECTIONS_KEY = 'fq-email-saved-sections'
const SAVED_SECTIONS_MAX = 40

function memory(seed?: string) {
  const data = new Map<string, string>(seed ? [[SAVED_SECTIONS_KEY, seed]] : [])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('saved sections', () => {
  it('keeps a copy of a block under its name, newest first', () => {
    const s = memory()
    const content = { text: 'Doors at 6' }
    saveSection(s, { name: 'Doors line', type: 'text', content }, 'Text')
    content.text = 'changed after saving'
    const list = saveSection(s, { name: 'Sign-off', type: 'text', content: { text: 'See you there' } }, 'Text')!
    expect(list.map((x) => x.name)).toEqual(['Sign-off', 'Doors line'])
    expect(loadSavedSections(s).find((x) => x.name === 'Doors line')?.content).toEqual({ text: 'Doors at 6' })
  })
  it('falls back to the block label when the name is blank', () => {
    expect(saveSection(memory(), { name: '  ', type: 'text', content: {} }, 'Text')![0].name).toBe('Text')
  })
  it('caps the library and drops the oldest', () => {
    const s = memory()
    for (let i = 0; i <= SAVED_SECTIONS_MAX; i++) saveSection(s, { name: `n${i}`, type: 'text', content: {} }, 'Text')
    const list = loadSavedSections(s)
    expect(list).toHaveLength(SAVED_SECTIONS_MAX)
    expect(list.some((x) => x.name === 'n0')).toBe(false)
  })
  it('deletes one and ignores bad stored data or missing storage', () => {
    const s = memory()
    const [a] = saveSection(s, { name: 'A', type: 'text', content: {} }, 'Text')!
    expect(deleteSection(s, a.id)).toEqual([])
    expect(loadSavedSections(memory('not json'))).toEqual([])
    expect(loadSavedSections(memory('[{"id":1}]'))).toEqual([])
    expect(loadSavedSections(null)).toEqual([])
    expect(saveSection(null, { name: 'A', type: 'text', content: {} }, 'Text')).toBeNull()
  })
})
