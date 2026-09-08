// The ONE boundary between model output and typed data (PROG-E8, ADR-1287).
//
// A model asked for JSON returns JSON most of the time, and prose around it, a code fence, a
// truncated array, or a key it was never asked for the rest of the time. Every AI path in this
// app used to answer that with its own `JSON.parse` and a hand-written `typeof` ladder, which is
// the shape EDITOR-ARCHITECTURE §9 named as the thing that does not scale past a few dozen
// sites: each ladder was subtly different, none was tested against a malformed reply, and a new
// field meant a new ladder.
//
// This module replaces the ladders with a schema. `parseModelJson` does the three things every
// site did (strip a fence, find the JSON span, parse it) and then hands the result to a zod
// schema. It never throws: a caller gets `{ ok: true, data }` or `{ ok: false, reason }` and keeps
// its existing fail-closed surface (return null, return [], fall back) exactly as before. The
// schema is the contract; the tests in schema.test.ts drive each one with a malformed reply.
//
// Pure. No I/O, no SDK. Safe to import from anywhere.

import { z } from 'zod'

export { z }

export type ModelJsonResult<T> = { ok: true; data: T } | { ok: false; reason: 'no-json' | 'bad-json' | 'bad-shape'; detail?: string }

/** Which JSON value the prompt asked for; decides which bracket pair we hunt for. */
export type ModelJsonShape = 'object' | 'array'

/** Strip a leading/trailing markdown code fence, with or without a language tag. */
export function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

/**
 * The widest span from the first opening bracket to the last closing one. Prose on either side
 * is discarded; prose in the middle makes it unparseable, which is the caller's `bad-json`.
 */
export function extractJsonSpan(text: string, shape: ModelJsonShape): string | null {
  const open = shape === 'array' ? '[' : '{'
  const close = shape === 'array' ? ']' : '}'
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

/**
 * Parse one model reply against a schema. Fence-tolerant, prose-tolerant at the edges, and it
 * fails closed on anything the schema refuses. The `detail` on a bad shape is zod's first issue,
 * for logs; it is never shown to a member.
 */
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>, shape: ModelJsonShape = 'object'): ModelJsonResult<T> {
  const text = stripFence(raw ?? '')

  // A reply that is ITSELF valid JSON is judged as itself, before any span is cut. Otherwise the
  // span would mine a value out of an enclosing document and answer a question nobody asked: asked
  // for an array, `{"ids":["a"]}` would yield `["a"]` from the brackets inside the object, and a
  // model that replied in the wrong shape would read as one that complied. Prose tolerance is for
  // prose, not for a well-formed document of the wrong shape.
  try {
    return validateModelValue(JSON.parse(text) as unknown, schema)
  } catch {
    // Not valid JSON on its own — fall through to the prose-tolerant span.
  }

  const span = extractJsonSpan(text, shape)
  if (!span) return { ok: false, reason: 'no-json' }
  let parsed: unknown
  try {
    parsed = JSON.parse(span)
  } catch {
    return { ok: false, reason: 'bad-json' }
  }
  return validateModelValue(parsed, schema)
}

/** Validate an already-parsed value (a tool_use input, a salvaged object) against a schema. */
export function validateModelValue<T>(value: unknown, schema: z.ZodType<T>): ModelJsonResult<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path?.length ? `${issue.path.map(String).join('.')}: ` : ''
    return { ok: false, reason: 'bad-shape', detail: `${where}${issue?.message ?? 'invalid'}` }
  }
  return { ok: true, data: result.data }
}

// ── Shared building blocks ─────────────────────────────────────────────────────────────────
// The pieces most reply contracts are built from. A note is a short trimmed string; a note list
// drops anything that is not a string rather than refusing the whole reply, because one stray
// value in an advisory list is not a reason to lose the other three.

/** A trimmed, capped string. Empty after trimming is still a string; callers decide if that counts. */
export const shortText = (max: number) => z.string().transform((s) => s.trim().slice(0, max))

/** A list of short strings; non-strings are dropped, empties are dropped, the list is capped. */
export const noteList = (maxItems: number, maxChars: number) =>
  z
    .array(z.unknown())
    .transform((items) =>
      items
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim().slice(0, maxChars))
        .filter(Boolean)
        .slice(0, maxItems),
    )

/** A plain JSON object with unknown keys (a draft, a tool argument), refusing arrays and scalars. */
export const jsonObject = z.record(z.string(), z.unknown())
