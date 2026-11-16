import { describe, it, expect } from 'vitest'
import { parseModelJson, validateModelValue, stripFence, extractJsonSpan, noteList, shortText, textOrEmpty, lenientList, jsonObject, aliasedText, looseEnum, looseNumber, rowsOrNone, unitBox, citedField, z } from './schema'

// The one boundary between model output and typed data (ADR-1287). These drive the helper with
// the shapes a model actually returns: fenced, prose-wrapped, truncated, wrong-typed, and right.

describe('stripFence + extractJsonSpan', () => {
  it('strips a code fence with or without a language tag', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripFence('```\n[1]\n```')).toBe('[1]')
    expect(stripFence('  {"a":1}  ')).toBe('{"a":1}')
  })

  it('finds the widest object or array span and ignores prose at the edges', () => {
    expect(extractJsonSpan('Sure! {"a":1} hope that helps', 'object')).toBe('{"a":1}')
    expect(extractJsonSpan('ids: ["x","y"].', 'array')).toBe('["x","y"]')
    expect(extractJsonSpan('nothing here', 'object')).toBeNull()
    expect(extractJsonSpan('}{', 'object')).toBeNull()
  })
})

describe('parseModelJson', () => {
  const S = z.object({ kind: z.enum(['tip', 'flag']), text: z.string() })

  it('parses a well-formed reply', () => {
    const r = parseModelJson('{"kind":"tip","text":"nice"}', S)
    expect(r).toEqual({ ok: true, data: { kind: 'tip', text: 'nice' } })
  })

  it('tolerates a fence and prose around the object', () => {
    const r = parseModelJson('Here you go:\n```json\n{"kind":"flag","text":"spam"}\n```\nDone.', S)
    expect(r.ok).toBe(true)
  })

  it('fails closed with no-json when there is nothing to parse', () => {
    expect(parseModelJson('', S)).toEqual({ ok: false, reason: 'no-json' })
    expect(parseModelJson('I cannot do that.', S)).toEqual({ ok: false, reason: 'no-json' })
  })

  it('fails closed with bad-json on a truncated reply', () => {
    expect(parseModelJson('{"kind":"tip","text":"cut off', S)).toEqual({ ok: false, reason: 'no-json' })
    expect(parseModelJson('{"kind":"tip", trailing}', S)).toMatchObject({ ok: false, reason: 'bad-json' })
  })

  it('fails closed with bad-shape and names the field when the schema refuses', () => {
    const r = parseModelJson('{"kind":"maybe","text":"x"}', S)
    expect(r).toMatchObject({ ok: false, reason: 'bad-shape' })
    if (!r.ok) expect(r.detail).toContain('kind')
    expect(parseModelJson('{"kind":"tip","text":7}', S)).toMatchObject({ ok: false, reason: 'bad-shape', detail: expect.stringContaining('text') })
  })

  it('hunts for an array when asked for one, and refuses an object in its place', () => {
    expect(parseModelJson('["a","b"]', z.array(z.string()), 'array')).toEqual({ ok: true, data: ['a', 'b'] })
    // An object is refused as the WRONG SHAPE rather than as missing json: the reply was valid
    // json, it just was not the array the caller asked for. Both are refusals; the reason is for logs.
    expect(parseModelJson('{"a":1}', z.array(z.string()), 'array')).toMatchObject({ ok: false, reason: 'bad-shape' })
    expect(parseModelJson('["a", 2]', z.array(z.string()), 'array')).toMatchObject({ ok: false, reason: 'bad-shape' })
  })

  it('judges a well-formed reply as itself rather than mining a value out of it', () => {
    // The span would cut `["a"]` out of the brackets inside this object and answer a question
    // nobody asked. A model that wrapped its array did not follow the array contract.
    expect(parseModelJson('{"ids":["a"]}', z.array(z.string()), 'array')).toMatchObject({ ok: false, reason: 'bad-shape' })
    // Prose tolerance is unaffected: this is not valid json on its own, so the span still runs.
    expect(parseModelJson('ids: ["x","y"].', z.array(z.string()), 'array')).toEqual({ ok: true, data: ['x', 'y'] })
  })

  it('never throws on a non-string', () => {
    expect(parseModelJson(undefined as unknown as string, S)).toEqual({ ok: false, reason: 'no-json' })
  })
})

describe('validateModelValue + the shared blocks', () => {
  it('validates an already-parsed value (a tool_use input)', () => {
    expect(validateModelValue({ a: 1 }, jsonObject)).toEqual({ ok: true, data: { a: 1 } })
    expect(validateModelValue([1], jsonObject)).toMatchObject({ ok: false })
    expect(validateModelValue('x', jsonObject)).toMatchObject({ ok: false })
    expect(validateModelValue(null, jsonObject)).toMatchObject({ ok: false })
  })

  it('noteList drops non-strings and empties, trims, caps length and count', () => {
    const r = noteList(2, 5).safeParse(['  abcdefg ', 3, '', null, 'ok', 'third'])
    expect(r.success && r.data).toEqual(['abcde', 'ok'])
  })

  it('shortText trims and caps', () => {
    expect(shortText(3).parse('  abcdef ')).toBe('abc')
  })

  it('textOrEmpty reads a wrong type or a missing key as empty', () => {
    const row = z.object({ note: textOrEmpty(3) })
    expect(row.parse({ note: '  abcdef ' })).toEqual({ note: 'abc' })
    expect(row.parse({ note: 42 })).toEqual({ note: '' })
    expect(row.parse({})).toEqual({ note: '' })
  })

  it('lenientList keeps the rows its schema accepts and drops the rest', () => {
    const list = lenientList(z.object({ id: z.string() }))
    expect(list.parse([{ id: 'a' }, null, 7, 'x', [], { id: 3 }, { id: 'b', extra: true }])).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(list.safeParse('not a list').success).toBe(false)
  })
})

describe('the extractor blocks (PROG-E8C)', () => {
  it('aliasedText keeps absent as absent so the other key can answer, and reads a wrong type as empty', () => {
    const row = z.object({ startsAt: aliasedText(5), starts_at: aliasedText(5) })
    const read = (v: unknown) => {
      const r = row.parse(v)
      return r.startsAt ?? r.starts_at ?? ''
    }
    expect(read({ startsAt: ' abcdefg ' })).toBe('abcde')
    expect(read({ starts_at: 'old' })).toBe('old')
    expect(read({ startsAt: null, starts_at: 'old' })).toBe('old')
    expect(read({ startsAt: 7, starts_at: 'old' })).toBe('')
    expect(read({})).toBe('')
  })

  it('looseEnum ignores case and space, and fails on anything outside the set', () => {
    const kind = looseEnum(['logo', 'photo'] as const)
    expect(kind.parse(' Logo ')).toBe('logo')
    expect(kind.safeParse('art').success).toBe(false)
    expect(kind.safeParse(3).success).toBe(false)
    expect(kind.catch('photo').parse(null)).toBe('photo')
  })

  it('looseNumber takes a number or a numeric string, and nothing that is not finite', () => {
    expect(looseNumber.parse(0.25)).toBe(0.25)
    expect(looseNumber.parse('0.25')).toBe(0.25)
    for (const junk of ['a quarter', null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY, {}]) expect(looseNumber.safeParse(junk).success).toBe(false)
  })

  it('rowsOrNone is empty for anything that is not a list, and each call gets its own list', () => {
    const rows = rowsOrNone(z.object({ id: z.string() }))
    expect(rows.parse([{ id: 'a' }, null, { id: 2 }])).toEqual([{ id: 'a' }])
    const a = rows.parse('nope')
    expect(a).toEqual([])
    a.push({ id: 'leak' })
    expect(rows.parse(undefined)).toEqual([])
  })

  it('unitBox clamps into the unit square and is null for a box that is degenerate or not a box', () => {
    expect(unitBox.parse({ x: -1, y: '0.5', w: 3, h: 0.9 })).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 })
    for (const junk of [{ x: 0, y: 0, w: 0.001, h: 1 }, { x: 0, y: 0, w: 1 }, { x: 'left', y: 0, w: 1, h: 1 }, 'box', null, undefined, []]) expect(unitBox.parse(junk)).toBeNull()
  })

  it('citedField reads each wrong-typed part as absent, and a field that is not an object as no field', () => {
    expect(citedField.parse({ value: 'v', snippet: 's', sourceUrl: 'u', kind: 'fact', confidence: 0.9, extra: 1 })).toEqual({ value: 'v', snippet: 's', sourceUrl: 'u', kind: 'fact', confidence: 0.9 })
    expect(citedField.parse({ value: 7, snippet: 9, sourceUrl: [], kind: 4, confidence: 'x' })).toEqual({})
    for (const junk of ['Acme', 3, null, undefined, []]) expect(citedField.parse(junk)).toBeUndefined()
  })
})
