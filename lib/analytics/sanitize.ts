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

// ── Pixel safety (LIVE-810, ADR-1720) ────────────────────────────────────────────────────────
//
// The first-party ledger may keep what a member told us; a third-party pixel may not. The
// launch brief's rule: "Wellness data never reaches ad or analytics pixels. That includes
// persona, archetype, Journey topics and Circle topics." Washington's My Health My Data Act and
// the FTC Health Breach Notification Rule treat these signals as sensitive.
//
// So every mirror to Google Analytics (the server Measurement Protocol in ./track.ts, the
// browser gtag in components/analytics/track-provider.tsx) and Vercel Analytics passes its props
// and paths through the two helpers below. They sit here, beside sanitizeProps, because both
// halves need them and this file is dependency-free.

/**
 * Prop keys that never leave for a pixel, compared case-insensitively. Persona and archetype
 * (who someone said they are), the arrival answer, mood, and any topic, interest, Journey or
 * Circle label (what they came for). Ids stay: an opaque uuid says nothing about a person.
 */
export const PIXEL_SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'persona',
  'personas',
  'archetype',
  'archetypes',
  'arrival',
  'arrivalanswer',
  'arrival_answer',
  'mood',
  'feeling',
  'topic',
  'topics',
  'interest',
  'interests',
  'journey',
  'journeyslug',
  'journeytitle',
  'circle',
  'circleslug',
  'circlename',
  'circletopic',
  'agerange',
  'age_band',
  'ageband',
  'gender',
])

/**
 * Route prefixes whose next segment names a Journey, Circle, topic, Practice or Channel. A page
 * view on `/journeys/grief-walks` would tell the pixel what someone is working through, so the
 * slug is replaced with `[slug]` before any path reaches one.
 */
export const PIXEL_PATH_PREFIXES: readonly string[] = [
  '/journeys',
  '/circles',
  '/discover/topics',
  '/discover/journeys',
  '/discover/circles',
  '/discover/practices',
  '/practices',
  '/channels',
  '/groups',
  '/topics',
]

/** The slug after any sensitive prefix becomes `[slug]`; every other path passes unchanged. */
export function pixelSafePath(path: string): string {
  if (typeof path !== 'string') return ''
  const q = path.search(/[?#]/)
  const pathname = q === -1 ? path : path.slice(0, q)
  for (const prefix of PIXEL_PATH_PREFIXES) {
    if (pathname.startsWith(prefix + '/')) {
      const rest = pathname.slice(prefix.length + 1)
      const slash = rest.indexOf('/')
      const tail = slash === -1 ? '' : rest.slice(slash)
      if (!rest || rest.startsWith('[')) return pathname
      return `${prefix}/[slug]${tail}`
    }
  }
  return pathname
}

/** Path-shaped prop keys whose VALUE is rewritten through pixelSafePath. */
const PATH_KEYS = new Set(['path', 'page', 'page_path', 'pagepath', 'page_location', 'url', 'href', 'from', 'to'])

/**
 * A prop bag fit for a pixel: sensitive keys dropped, path-shaped values redacted. Full URLs keep
 * their origin. Input is assumed already sanitised (primitives only).
 */
export function pixelSafeProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(sanitizeProps(props, 40, 500))) {
    const key = k.toLowerCase()
    if (PIXEL_SENSITIVE_KEYS.has(key)) continue
    if (typeof v === 'string' && PATH_KEYS.has(key)) {
      const m = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(v)
      out[k] = m ? m[1] + pixelSafePath(m[2] ?? '/') : pixelSafePath(v)
      continue
    }
    out[k] = v
  }
  return out
}
