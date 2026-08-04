// The one pure helper both halves of analytics need — and the reason it lives alone.
//
// WHY THIS FILE EXISTS. `sanitizeProps` used to live in ./track.ts. That is a SERVER
// module: it imports `recordEngagementEvent` (-> lib/supabase/admin -> @supabase/supabase-js)
// and, transitively, lib/automations -> lib/unsubscribe-tokens -> node:crypto. Meanwhile
// ./interaction-events.ts imported this one function from it, ./observe.ts imported
// MAX_BATCH from interaction-events, ./vitals.ts imported getSessionId from observe, and
// components/analytics/web-vitals.tsx -- a 'use client' component mounted in the ROOT
// layout -- imported vitals.
//
// So a five-hop chain of `import` statements, every link of which looks harmless, put
// @supabase/supabase-js and a full crypto-browserify polyfill graph into the browser
// bundle of EVERY page on the site. Measured off the build: ~627KB raw / ~178KB gzip,
// on 390 of 481 routes, none of which could ever execute a line of it. It is the whole
// reason the marketing pages score 0 on Lighthouse's unused-javascript.
//
// Nothing in this function was ever the problem. It takes an unknown and returns a
// bounded bag of primitives; it has no imports and cannot acquire any. It was simply
// parked in a file whose other exports reach the database, and a bundler follows
// modules, not intentions.
//
// KEEP THIS FILE DEPENDENCY-FREE. An import here re-opens the leak for every page.

/**
 * Coerce arbitrary input into a bounded, primitive-only prop bag.
 *
 * Drops anything that is not a string / number / boolean, caps the number of keys and
 * the length of each string. Used on both sides of the wire: the client buffer sanitises
 * before it sends, and the /api/observe sink sanitises again on what arrives, because
 * the client half is attacker-controlled.
 */
/**
 * An acceptable prop KEY: a short identifier, letters/digits/underscore/dot, starting with
 * a letter.
 *
 * An allowlist rather than a denylist of `__proto__` / `constructor` / `prototype`, and the
 * difference matters. A denylist answers "is this one of the three bad names I thought of",
 * which is a question that goes stale; this answers "is this a name our own code would ever
 * produce", which does not. Every real caller passes a plain identifier -- `circleId`,
 * `practiceId`, `hasAvatar`, `path`, `pct`, `medium` -- so nothing legitimate is lost, and
 * the ledger stops being able to accumulate junk keys from a client we do not control.
 *
 * Deliberately the same discipline as `isValidKind` in ./interaction-events.ts, which bounds
 * the open KIND taxonomy the same way. Case-insensitive here because prop keys are camelCase
 * while kind slugs are lowercase.
 */
const SAFE_PROP_KEY = /^[A-Za-z][A-Za-z0-9_.]{0,39}$/

/**
 * ...and the two machinery names that the pattern above does NOT catch.
 *
 * `__proto__` fails SAFE_PROP_KEY on its own (it starts with an underscore), but
 * `constructor` and `prototype` are perfectly ordinary identifiers and sail straight
 * through. An earlier version of this file claimed the allowlist covered all three "as a
 * side effect"; the test for it disagreed, which is the entire reason that test exists.
 * Both checks, because neither is sufficient alone.
 */
const MACHINERY_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function sanitizeProps(
  input: unknown,
  maxKeys = 20,
  maxLen = 500,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!input || typeof input !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= maxKeys) break
    // The key is attacker-influenced, so it is checked before it is ever used to write.
    // Shape first (bounds the ledger to identifiers), then the machinery names the shape
    // rule cannot see -- `constructor` and `prototype` are valid identifiers.
    if (!SAFE_PROP_KEY.test(k) || MACHINERY_KEYS.has(k)) continue
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
      n++
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, maxLen)
      n++
    }
  }
  return out
}
