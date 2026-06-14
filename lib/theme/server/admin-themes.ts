import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateThemeTokens } from '../validate'
import type { ThemeKind, ThemeRow, ThemeStatus } from '../admin-types'

// Admin-side THEME reads for Theme Studio. These power the operator list + editor, which
// gate themselves (app/(main)/admin/appearance) — so these reads go through the
// service-role admin client (which bypasses the active-only RLS, the way lib/spaces/store.ts
// reads spaces). Snake_case columns are mapped to the camelCase ThemeRow contract
// (lib/theme/admin-types.ts), and `tokens` is re-validated through the same allowlist the
// renderer uses so the editor never sees an unsafe value. FAIL-SAFE: the `themes` table may
// not exist until the migration is applied in prod, so every read is wrapped and degrades to
// [] / null on ANY error rather than throwing.

const COLS =
  'id, slug, name, kind, tokens, status, is_default, window_start, window_end, created_at, updated_at'

type DbThemeRow = {
  id: string
  slug: string
  name: string
  kind: string
  tokens: unknown
  status: string
  is_default: boolean
  window_start: string | null
  window_end: string | null
  created_at: string
  updated_at: string
}

/** Map a snake_case DB row to the camelCase ThemeRow, re-validating tokens to the safe subset. */
function mapTheme(r: DbThemeRow): ThemeRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind as ThemeKind,
    tokens: validateThemeTokens(r.tokens),
    status: r.status as ThemeStatus,
    isDefault: r.is_default,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Every theme, newest first. Fail-safe: returns [] on any error (e.g. table not yet migrated). */
export async function listThemes(): Promise<ThemeRow[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('themes')
      .select(COLS)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as DbThemeRow[]).map(mapTheme)
  } catch {
    return []
  }
}

/** A single theme by id, or null if absent/on any error. */
export async function getTheme(id: string): Promise<ThemeRow | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('themes')
      .select(COLS)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return mapTheme(data as DbThemeRow)
  } catch {
    return null
  }
}
