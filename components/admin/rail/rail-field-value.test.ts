import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIELD_KINDS } from '@/lib/studio/kernel/manifest'
import { isListKind, joinFieldValue, splitFieldValue, LIST_KINDS, LIST_SEPARATOR } from './rail-field-value'

// ─────────────────────────────────────────────────────────────────────────────
// THE RAIL'S LIST ROUND TRIP (ADR-1309).
//
// The defect this pins shut: the rail joined a list control's array on the way out and handed the
// joined string straight back on the way in, where the kit reads a string as a ONE-ITEM list. Three
// tags became one chip spelled "a, b, c", and saving again persisted that single tag. Both
// directions are asserted, plus the composition, because only the composition is the bug.
// ─────────────────────────────────────────────────────────────────────────────

describe('splitFieldValue / joinFieldValue', () => {
  it('leaves a scalar kind alone in both directions', () => {
    expect(splitFieldValue('text', 'Breath, Is Life')).toBe('Breath, Is Life')
    expect(splitFieldValue('longtext', undefined)).toBe('')
    expect(joinFieldValue('Breath, Is Life')).toBe('Breath, Is Life')
  })

  it('reads a list kind back as a LIST, which is the whole defect', () => {
    expect(splitFieldValue('tags', 'breath, sound, rest')).toEqual(['breath', 'sound', 'rest'])
    expect(splitFieldValue('multiselect', 'a,b')).toEqual(['a', 'b'])
  })

  it('round-trips a list without losing or inventing an item', () => {
    const items = ['breath', 'sound', 'rest']
    expect(splitFieldValue('tags', joinFieldValue(items))).toEqual(items)
  })

  it('never yields a phantom empty item', () => {
    expect(splitFieldValue('tags', '')).toEqual([])
    expect(splitFieldValue('tags', undefined)).toEqual([])
    expect(splitFieldValue('tags', 'breath, , rest')).toEqual(['breath', 'rest'])
    expect(joinFieldValue(['breath', '', 'rest'])).toBe(`breath${LIST_SEPARATOR}rest`)
  })

  it('names exactly the kinds whose control takes an array, and no kind it does not know', () => {
    expect([...LIST_KINDS].sort()).toEqual(['daterange', 'images', 'multiselect', 'tags'])
    for (const kind of LIST_KINDS) expect(FIELD_KINDS).toContain(kind)
    expect(isListKind('text')).toBe(false)
    expect(isListKind('tags')).toBe(true)
  })

  // The consumer half: a rail that hand-joined its own value would keep the bug while these pass.
  it('is what RailManifestFields uses, rather than a second copy of the rule', () => {
    const source = readFileSync(join(__dirname, 'rail-manifest-fields.tsx'), 'utf8')
    expect(source).toMatch(/from '\.\/rail-field-value'/)
    expect(source).toMatch(/splitFieldValue\(/)
    expect(source).toMatch(/joinFieldValue\(/)
    expect(source).not.toMatch(/Array\.isArray\(next\) \? next\.join/)
  })
})
