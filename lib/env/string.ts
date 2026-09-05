// Env reads where BLANK MEANS UNSET (scan2 L3-02, 2026-09-05).
//
// `@next/env` loads a `.env` line `KEY=` as the empty string, and Vercel happily stores a variable
// created with no value the same way. An empty string is not nullish, so every `process.env.KEY ??
// fallback` in the repo kept the blank and shipped it into a From header (`<>`), a Message-ID
// (`@>`), a User-Agent (`Frequency/1.0 ()`) and, worst, a rate limit (`Number('') === 0`, which
// passed a `>= 0` guard and removed the spacing between Nominatim calls). `.env.example` ships
// exactly those keys blank, so `cp .env.example .env.local` reproduced all four.
//
// app/api/status/route.ts already fixed this class once with a local `envOrNull`; this module is
// that idiom, shared. PURE (reads process.env at call time, never at import, so a test can set the
// variable and call again).

/** The trimmed value of `process.env[key]`, or null when the variable is unset, empty, or only
 *  whitespace. The one primitive the other two are built on. */
export function envStringOrNull(key: string): string | null {
  const trimmed = process.env[key]?.trim()
  return trimmed ? trimmed : null
}

/** A string env var with a fallback that also covers the BLANK case. `envString('X', 'd')` is
 *  `'d'` for `X` unset, `X=` and `X=   ` alike; a set value comes back trimmed. */
export function envString(key: string, fallback: string): string {
  return envStringOrNull(key) ?? fallback
}

/** A numeric env var with a fallback. Unset / blank / non-numeric (`NaN`, `Infinity`) all yield the
 *  fallback; a value below `min` yields the fallback too. An explicit `X=0` is a deliberate 0 and is
 *  returned as such (when `min` allows it), which is the distinction the rate-limit bug turned on:
 *  blank must keep the default, zero must mean zero. */
export function envNumber(key: string, fallback: number, options: { min?: number } = {}): number {
  const raw = envStringOrNull(key)
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  if (options.min !== undefined && n < options.min) return fallback
  return n
}
