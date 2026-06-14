import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateThemeTokens } from '../validate'
import { themeToCss } from '../css'

// The server THEME-CSS reader — themes-read. Turns the active DB theme rows into the scoped
// `<style>` body the root layout injects. Reads go through the service-role admin client
// (the table's RLS already restricts public reads to active themes), same shape as
// lib/spaces/store.ts. For the active request's skin/occasion, every row's `tokens` is
// re-validated (lib/theme/validate.ts) and rendered (lib/theme/css.ts) before it can reach
// the page — the DB is never trusted to be clean.
//
// FAIL-SAFE: the entire DB access is wrapped in try/catch and returns '' on ANY error. The
// `themes` table may not exist until the migration is applied in prod, so the app must keep
// rendering the code CSS skins (app/globals.css) untouched until then. REQUEST-CACHED via
// React.cache so it runs at most once per request even if the layout reads it twice.

type ThemeRow = {
  slug: string
  tokens: unknown
}

/** Render one active theme row (by kind + slug) to its scoped CSS, or '' if absent/invalid. */
async function loadThemeCssFor(kind: 'skin' | 'occasion', slug: string): Promise<string> {
  const { data } = await createAdminClient()
    .from('themes')
    .select('slug, tokens')
    .eq('kind', kind)
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return ''
  const row = data as ThemeRow
  // A skin theme is applied via [data-skin], an occasion overlay via [data-occasion]; emit
  // the rule against the attribute the shell actually sets for this kind, else it never matches.
  const attr = kind === 'occasion' ? 'data-occasion' : 'data-skin'
  return themeToCss(attr, row.slug, validateThemeTokens(row.tokens))
}

/**
 * The scoped `<style>` body for the active themes of a request, request-cached + fail-safe.
 * Resolves the active `kind='skin'` theme whose slug == input.skin and (when not 'none') the
 * active `kind='occasion'` theme whose slug == input.occasion, validates + renders each, and
 * concatenates. Returns '' on ANY error so the code CSS skins remain the fallback.
 */
export const loadActiveThemeCss = cache(
  async (input: { skin: string; occasion: string }): Promise<string> => {
    try {
      const [skinCss, occasionCss] = await Promise.all([
        loadThemeCssFor('skin', input.skin),
        input.occasion && input.occasion !== 'none'
          ? loadThemeCssFor('occasion', input.occasion)
          : Promise.resolve(''),
      ])
      return skinCss + occasionCss
    } catch {
      return ''
    }
  },
)

/** Format a Date as the local-calendar 'MM-DD' key used to test occasion windows. */
function monthDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/** Is the 'MM-DD' `key` inside the inclusive `[start, end]` window? Handles year-wrap. */
function inWindow(key: string, start: string, end: string): boolean {
  // A normal window sits within one year (start <= end): the key must fall between them.
  // A year-wrapping window (start > end, e.g. '12-20'..'01-05') is active on EITHER side of
  // the wrap, so the key matches when it's at/after the start OR at/before the end.
  return start <= end ? key >= start && key <= end : key >= start || key <= end
}

type OccasionWindowRow = {
  slug: string
  window_start: string | null
  window_end: string | null
}

/**
 * Resolve the DB occasion whose MM-DD window currently contains `now`, else 'none'. Queries
 * the active `kind='occasion'` rows (created in Theme Studio with a [window_start, window_end]
 * MM-DD window) and returns the first whose inclusive window — possibly year-wrapping
 * (start > end, e.g. '12-20'..'01-05') — contains `now`. Rows missing either bound are
 * skipped. REQUEST-CACHED + FAIL-SAFE: returns 'none' on ANY error (the themes table may not
 * exist until the migration is applied), so the time axis silently falls back to no occasion.
 */
export const resolveActiveOccasionSlug = cache(async (now: Date): Promise<string> => {
  try {
    const { data } = await createAdminClient()
      .from('themes')
      .select('slug, window_start, window_end')
      .eq('kind', 'occasion')
      .eq('status', 'active')
    if (!data) return 'none'
    const key = monthDay(now)
    for (const row of data as OccasionWindowRow[]) {
      if (!row.window_start || !row.window_end) continue
      if (inWindow(key, row.window_start, row.window_end)) return row.slug
    }
    return 'none'
  } catch {
    return 'none'
  }
})
