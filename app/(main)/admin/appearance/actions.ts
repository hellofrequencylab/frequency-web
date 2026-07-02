'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { validateThemeTokens, isSafeSlug } from '@/lib/theme/validate'
import type { Database } from '@/lib/database.types'
import type { ThemeInput, ThemeKind, ThemeStatus } from '@/lib/theme/admin-types'

type ThemeInsert = Database['public']['Tables']['themes']['Insert']
type ThemeUpdate = Database['public']['Tables']['themes']['Update']

// Server actions for Theme Studio (app/(main)/admin/appearance). A theme is a named set of
// DAWN token overrides an operator edits as DATA — no code deploy. Theme Studio is a GLOBAL
// brand control, so the gate is the staff axis at 'janitor' (Executive Admin), the strictest
// rung, with no staff-domain side door. Writes go through the service-role admin client; the
// specific insert/update payloads are cast to the generated themes types (ADR-246 — never the
// whole client). EVERY write is fail-closed and SECURITY-FIRST:
// gate first, validate the slug (it becomes a CSS selector), run tokens through the same
// allowlist the renderer uses and persist ONLY the sanitized subset (never the raw client
// payload), and clamp kind/status/MM-DD window shape. On success we revalidate the Studio AND
// the root layout ('/', 'layout') — the active theme's <style> is injected there, so the whole
// app must re-render to pick up a change.

const LIST_PATH = '/admin/appearance'

/** Fail-closed gate. requireAdmin redirects an unauthorized viewer; we keep the id for
 *  created_by/updated_by stamping. Theme Studio is global brand → janitor only, no staff side door. */
async function gate(): Promise<string> {
  const { profileId } = await requireAdmin('janitor')
  return profileId
}

const KINDS: ReadonlySet<ThemeKind> = new Set<ThemeKind>(['skin', 'occasion'])
const STATUSES: ReadonlySet<ThemeStatus> = new Set<ThemeStatus>(['draft', 'active', 'archived'])

// Inclusive 'MM-DD' calendar bound for kind='occasion' windows (01-01 … 12-31).
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Coerce a raw window bound to a valid 'MM-DD' string, or null (empty / malformed dropped). */
function safeWindow(value: string | null | undefined): string | null {
  if (!value) return null
  const v = String(value).trim()
  return MMDD.test(v) ? v : null
}

/** Validate + map a ThemeInput to its DB column shape. Returns null with a message on bad input.
 *  Tokens are reduced to the sanitized allowlisted subset — the raw payload is never persisted. */
function toColumns(
  input: ThemeInput,
): { columns: Record<string, unknown> } | { error: string } {
  const slug = String(input.slug ?? '').trim().toLowerCase()
  if (!isSafeSlug(slug)) {
    return { error: 'That slug isn’t valid. Use lowercase letters, numbers, and hyphens (up to 40).' }
  }
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'Give the theme a name.' }
  const kind = (input.kind as ThemeKind) ?? 'skin'
  if (!KINDS.has(kind)) return { error: 'That theme kind isn’t supported.' }

  // Re-validate tokens against the allowlist — persist ONLY the safe subset.
  const tokens = validateThemeTokens(input.tokens)

  // The MM-DD window applies to occasions only; it is ignored (nulled) for skins.
  const windowStart = kind === 'occasion' ? safeWindow(input.windowStart) : null
  const windowEnd = kind === 'occasion' ? safeWindow(input.windowEnd) : null

  return {
    columns: {
      slug,
      name: name.slice(0, 200),
      kind,
      tokens,
      window_start: windowStart,
      window_end: windowEnd,
    },
  }
}

/** Create a new draft theme. Returns its id on success. */
export async function createTheme(input: ThemeInput): Promise<ActionResult<{ id: string }>> {
  const me = await gate()
  const built = toColumns(input)
  if ('error' in built) return fail(built.error)
  const payload = {
    ...built.columns,
    status: 'draft',
    created_by: me,
    updated_at: new Date().toISOString(),
  } as ThemeInsert
  const { data, error } = await createAdminClient()
    .from('themes')
    .insert(payload)
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the theme.')
  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok({ id: (data as { id: string }).id })
}

/** Patch a theme's editable fields (the editor's Save). */
export async function updateTheme(id: string, input: ThemeInput): Promise<ActionResult> {
  await gate()
  const built = toColumns(input)
  if ('error' in built) return fail(built.error)
  const payload = { ...built.columns, updated_at: new Date().toISOString() } as ThemeUpdate
  const { error } = await createAdminClient().from('themes').update(payload).eq('id', id)
  if (error) return fail('Could not save the theme.')
  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}

/** Move a theme through its lifecycle (draft → active → archived). */
export async function setThemeStatus(id: string, status: ThemeStatus): Promise<ActionResult> {
  await gate()
  if (!STATUSES.has(status)) return fail('That status isn’t supported.')
  const payload = { status, updated_at: new Date().toISOString() } as ThemeUpdate
  const { error } = await createAdminClient().from('themes').update(payload).eq('id', id)
  if (error) return fail('Could not update the theme.')
  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}

/** Make this skin theme the single global default — clears the flag on every other skin row. */
export async function setDefaultTheme(id: string): Promise<ActionResult> {
  await gate()
  const db = createAdminClient()
  // VERIFY the target is a real skin BEFORE clearing the flag on every other skin. A bad id
  // (missing row, or an 'occasion' theme) would otherwise clear the existing default and then
  // set it on nothing — leaving the whole app with NO default skin.
  const { data: target } = await db.from('themes').select('id, kind').eq('id', id).maybeSingle()
  const row = target as { id: string; kind: string } | null
  if (!row) return fail('That theme no longer exists.')
  if (row.kind !== 'skin') return fail('Only a skin theme can be the default.')

  // Clear the default on all OTHER skin themes (the table enforces one default skin via a
  // partial unique index), then set it on this verified row.
  const now = new Date().toISOString()
  const cleared = await db
    .from('themes')
    .update({ is_default: false, updated_at: now } as ThemeUpdate)
    .eq('kind', 'skin')
    .neq('id', id)
  if (cleared.error) return fail('Could not update the default theme.')
  const { error } = await db
    .from('themes')
    .update({ is_default: true, updated_at: now } as ThemeUpdate)
    .eq('id', id)
  if (error) return fail('Could not set the default theme.')
  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}

/** Delete a theme. */
export async function deleteTheme(id: string): Promise<ActionResult> {
  await gate()
  const { error } = await createAdminClient().from('themes').delete().eq('id', id)
  if (error) return fail('Could not delete the theme.')
  revalidatePath(LIST_PATH)
  revalidatePath('/', 'layout')
  return ok()
}
