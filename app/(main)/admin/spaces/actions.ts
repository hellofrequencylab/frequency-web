'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { listThemes } from '@/lib/theme/server/admin-themes'
import { isSpaceThemeId, DEFAULT_SPACE_THEME } from '@/lib/theme/space-themes'

// Server actions for the per-Space branding surface (docs/SPACES.md, ADR-249/250). Janitor-
// gated, mirroring the rest of the Spaces tenancy admin. The per-Space THEME is the existing
// `spaces.skin` column; the VISUAL brand fields (name/logo/accent) ship in
// 20260626000000_space_brand.sql. Writes go through the service-role admin client.
// Fail-closed: the gate redirects on denial,
// every input is validated server-side before it touches the row, and a successful write
// revalidates the admin list AND the root layout (a skin change repaints every Space surface).

const LIST_PATH = '/admin/spaces'

// The built-in code skins (app/globals.css) that always resolve even with no DB theme row.
const BUILTIN_SKINS = new Set(['default', 'midnight'])

// A safe brand-accent color: hex (#rgb/#rrggbb/#rrggbbaa) or a strictly-numeric rgb/hsl
// function. Mirrors lib/theme/validate.ts isSafeColor (which is server-only/not exported) so
// nothing server-only leaks into the client editor — the check lives here, server-side.
const FORBIDDEN_COLOR = /[;{}<>\\\n\r]|url\(|expression|\/\*/i
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const NUMERIC_FUNC_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\s]+\)$/i

function isSafeAccent(value: string): boolean {
  if (FORBIDDEN_COLOR.test(value)) return false
  return HEX_COLOR.test(value) || NUMERIC_FUNC_COLOR.test(value)
}

/** Is `url` a usable brand-logo URL: a same-origin (root-relative) path, or an https URL. */
function isSafeLogoUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** The skin slugs an operator may assign: every ACTIVE skin theme + the built-in code skins. */
async function allowedSkins(): Promise<Set<string>> {
  const allowed = new Set(BUILTIN_SKINS)
  const themes = await listThemes().catch(() => [])
  for (const t of themes) {
    if (t.kind === 'skin' && t.status === 'active') allowed.add(t.slug)
  }
  return allowed
}

export interface SpaceBrandingInput {
  /** The assigned theme: a known active skin slug or a built-in ('default' | 'midnight'). */
  skin: string
  brandName: string | null
  brandAccent: string | null
  brandLogoUrl: string | null
  /** The Space PAGE THEME (ADR-578): a typography + shape identity id, stored on preferences.theme. A known
   *  non-default id is kept; the default ('bold') or an unknown value clears the key. Omit to leave it. */
  pageTheme?: string | null
}

/**
 * Set a Space's theme + brand fields. Janitor-gated. Validates: `skin` is a known active
 * skin-theme slug or a built-in; `brandAccent` is a safe color (or cleared); `brandLogoUrl`
 * is same-origin or https (or cleared); `brandName` is trimmed/length-capped (or cleared). On
 * success revalidates the admin list and the root layout (the skin drives `data-skin`, so a
 * change repaints every Space surface). Returns ActionResult.
 */
export async function updateSpaceBranding(
  id: string,
  input: SpaceBrandingInput,
): Promise<ActionResult> {
  await requireAdmin('janitor')

  const skin = input.skin.trim().toLowerCase()
  if (!(await allowedSkins()).has(skin)) {
    return fail('Pick a theme from the list (an active skin theme or a built-in).')
  }

  const name = (input.brandName ?? '').trim()
  const brandName = name ? name.slice(0, 200) : null

  const accentRaw = (input.brandAccent ?? '').trim()
  let brandAccent: string | null = null
  if (accentRaw) {
    if (!isSafeAccent(accentRaw)) {
      // token-ok: example hex shown in validation copy, not a style value
      return fail('That accent color isn’t valid. Use a hex (#3D352A) or rgb/hsl value.')
    }
    brandAccent = accentRaw
  }

  const logoRaw = (input.brandLogoUrl ?? '').trim()
  let brandLogoUrl: string | null = null
  if (logoRaw) {
    if (!isSafeLogoUrl(logoRaw)) {
      return fail('The logo URL must be an https link or a same-origin path (starting with “/”).')
    }
    brandLogoUrl = logoRaw.slice(0, 1000)
  }

  const patch: Record<string, unknown> = {
    skin,
    brand_name: brandName,
    brand_accent: brandAccent,
    brand_logo_url: brandLogoUrl,
  }

  // The Space PAGE THEME (ADR-578) lives on preferences.theme (jsonb). Read-modify-write so every other
  // preferences key is preserved; a known non-default id is stored, the default clears the key (sparse).
  if (input.pageTheme !== undefined) {
    const { data } = await createAdminClient().from('spaces').select('preferences').eq('id', id).maybeSingle()
    const prefs =
      data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)
        ? { ...(data.preferences as Record<string, unknown>) }
        : {}
    const theme = (input.pageTheme ?? '').trim()
    if (theme && isSpaceThemeId(theme) && theme !== DEFAULT_SPACE_THEME) prefs.theme = theme
    else delete prefs.theme
    patch.preferences = prefs
  }

  // `preferences` widens the patch beyond the generated column types (ADR-246), so write through an untyped
  // admin handle — the same pattern lib/spaces/profile-settings.ts uses.
  const db = createAdminClient() as unknown as {
    from: (t: string) => { update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } }
  }
  const { error } = await db.from('spaces').update(patch).eq('id', id)

  if (error) return fail('Could not save the Space branding.')

  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${id}`)
  // The Space's skin selects its active theme through the shell's data-skin resolution, so a
  // theme change must repaint every Space surface — revalidate the root layout.
  revalidatePath('/', 'layout')
  return ok()
}
