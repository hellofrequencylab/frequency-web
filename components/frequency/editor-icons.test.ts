import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FQ_EDITOR_ICONS } from './icon'

// BLD-003: every editor glyph the builder names resolves in the hand-kept sprite, on the 24px grid at 1.75 stroke.
describe('editor icon sprite', () => {
  const svg = fs.readFileSync('public/brand/frequency/frequency-editor-icons.svg', 'utf8')
  it.each(FQ_EDITOR_ICONS)('draws %s', (id) => {
    const m = svg.match(new RegExp(`<symbol id="${id}"[^>]*>`))
    expect(m, id).toBeTruthy()
    expect(m![0]).toContain('viewBox="0 0 24 24"')
    expect(m![0]).toContain('stroke-width="1.75"')
  })
  it('has no symbol the list does not name', () => {
    const ids = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((x) => x[1])
    expect(ids.sort()).toEqual([...FQ_EDITOR_ICONS].sort())
  })
})
