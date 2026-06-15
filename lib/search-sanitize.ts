// Sanitizers for user-supplied search text used in Supabase/PostgREST queries (ADR-274).
// Two cases:
//   - escapeLike: a value interpolated into a single `.ilike()`/`.like()` PATTERN. There is no
//     grammar to break (the value is sent as a bound argument), but `%` `_` `\` act as LIKE
//     wildcards — escape them so the input matches as a literal substring.
//   - sanitizeOrTerm: a value interpolated into a PostgREST `.or()`/`.filter()` EXPRESSION STRING.
//     There the delimiters `(` `)` `,` would let crafted input inject extra filter conditions, so
//     strip those, then escape the LIKE wildcards, trim, and cap the length.
// Mirrors the long-standing inline sanitizer in app/api/search/route.ts, centralized so every
// search path (including the ones that run on the RLS-bypassing service-role client) shares it.

/** Escape PostgREST/SQL LIKE wildcards so user input matches as a literal substring. */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

/** Make a user term safe to interpolate into a PostgREST `or()`/`filter()` expression: drop the
 *  `(` `)` `,` grammar characters that delimit conditions, escape LIKE wildcards, trim, and cap. */
export function sanitizeOrTerm(input: string, maxLen = 80): string {
  return escapeLike(input.replace(/[(),]/g, ' ').trim().slice(0, maxLen))
}
