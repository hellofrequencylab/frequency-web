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
  return themeToCss(row.slug, validateThemeTokens(row.tokens))
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
