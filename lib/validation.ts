import { z } from 'zod'

// Input validation at the server-action boundary (ADR-246, Phase 3 hardening).
// Server actions receive untrusted client input typed only by assumption. `parseInput`
// turns that into a parsed, trusted value — parse, don't validate. Use it at the TOP of a
// `'use server'` action, after the authz guard:
//
//   const { amount, reason } = parseInput(economyAdjustment, { amount, reason })
//
// It throws a concise Error on bad input, preserving the throw-based action flow.

export { z }

/** Parse `input` with `schema`; throw a concise Error on failure (so existing
 *  try/catch-around-actions behaviour is preserved). Returns the parsed, typed value. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    throw new Error(`${where}${issue?.message ?? 'Invalid input'}`)
  }
  return result.data
}

// ── Shared field schemas ──────────────────────────────────────────────────────────────

/** A v4-style UUID (Supabase ids). */
export const uuid = z.uuid()

/** Non-empty text, trimmed. Pass a custom message for parity with prior hand-rolled errors. */
export const requiredText = (message = 'Required') => z.string().trim().min(1, message)

/** A positive integer amount: mirrors the common `Math.floor(n)` + `0 < n <= max` guard.
 *  Floors fractional input (faithful to the prior behaviour), rejects ≤0, >max, NaN, ∞. */
export const positiveIntAmount = (max: number, message = 'Invalid amount') =>
  z
    .number()
    .transform((n) => Math.floor(n))
    .refine((n) => Number.isFinite(n) && n > 0 && n <= max, message)
