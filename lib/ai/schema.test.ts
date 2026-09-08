import { describe, it, expect } from 'vitest'
import { parseModelJson, validateModelValue, stripFence, extractJsonSpan, noteList, shortText, jsonObject, z } from './schema'

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
})
