'use server'

import type { Data } from '@measured/puck'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isSpaceTemplate, type SpaceTemplate } from '@/lib/spaces/templates'
import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'
import { isRenderableSpaceDoc, spacePuckData, type SpacePresetInput } from '@/lib/page-editor/templates/space'
import { moveBlock, setBlockHidden } from '@/lib/page-editor/templates/space-blocks'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { nextLayoutPreferences, nextCoverSizePreferences, type CoverSize } from './preferences'

// SPACE LAYOUT actions (ADR-472, the public-page layout layer). An operator picks the STARTING layout
// their Space's public landing renders through (one of the four templates Book · Schedule · Storefront ·
// Hub, or 'auto' to derive it from the type + Focus) from /spaces/<slug>/manage/layout. EVERY action
// RE-RESOLVES the space from the slug and RE-GATES caps.canEditProfile server-side, so a non-editor can
// never rewrite another space's layout (the route gate is UX; this is the authority). Staff preview (a
// janitor who is not an editor) is read-only: it has no canEditProfile, so every write below fails closed.
//
// SEMANTICS (important):
//   • preferences.template = the operator's CHOSEN starting layout (overrides the auto-derived one).
//     'auto' clears the override so the layout derives from the Space's type + Focus again.
//   • preferences.puck = the CUSTOMIZED doc; it WINS over any preset. So setting `template` alone does
//     NOT visibly change a customized space's landing — the reset path (opts.reset) also clears `puck`
//     so the new layout's preset actually shows.
//
// NON-DESTRUCTIVE by default: setting the template only writes the `template` node of preferences,
// preserving every other key (the puck doc, the mode overrides). A `reset` additionally clears the one
// `puck` node (the resolver then falls back to the new template's preset). Modelled on the edit-page
// publish/reset actions; deliberately NOT coupled to that file. No em dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s space; returns the resolved
 *  space id + its current preferences blob, or null on any miss. Mirrors edit-page/actions.ts's shape
 *  intentionally (kept local so this file is self-contained, not coupled to the editor actions). */
async function authorizeEditor(slug: string): Promise<{
  spaceId: string
  preferences: Record<string, unknown>
  /** The fields the preset resolver needs, so the block panel can resolve the CURRENT doc
   *  (stored-or-preset) server-side before it reorders / toggles a block. */
  presetInput: SpacePresetInput
} | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return null // owner / admin / editor (the write authority)
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return {
    spaceId: space.id,
    preferences: asRecord(space.preferences),
    presetInput: {
      name: space.brandName?.trim() || space.name,
      type: space.type,
      variant: space.modeVariant,
      plan: space.plan,
      preferences: space.preferences,
    },
  }
}

/** Untyped scoped update of the space's preferences column (ADR-246), bound to the id. */
async function writePreferences(
  spaceId: string,
  preferences: Record<string, unknown>,
): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences }).eq('id', spaceId)
  return !error
}

/**
 * Set the Space's public-page STARTING layout. `template` is one of the four template ids, or 'auto' to
 * clear the override and derive the layout from the Space's type + Focus. NON-DESTRUCTIVE by default:
 * only the `template` node is written; the customized `puck` doc + mode overrides are preserved. Pass
 * `opts.reset` to ALSO clear the customized `puck` doc, so the new layout's preset renders instead of the
 * saved page (the caller confirms this replaces the customized page). Owner/admin/editor-gated. Returns
 * ActionResult.
 */
export async function setSpaceLayoutTemplate(
  slug: string,
  template: SpaceTemplate | 'auto',
  opts?: { reset?: boolean },
): Promise<ActionResult> {
  if (template !== 'auto' && !isSpaceTemplate(template)) return fail('Pick a layout from the list.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextLayoutPreferences(auth.preferences, template, opts)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the layout. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set the public Space header's COVER SIZE: 'header' (a compact identity band) or 'hero' (a tall,
 * immersive cover). Read by the profile layout off preferences.coverSize. NON-DESTRUCTIVE: only the
 * `coverSize` node is written, every other preferences key preserved. Owner/admin/editor-gated
 * (staff preview fails closed). Returns ActionResult.
 */
export async function setSpaceCoverSize(slug: string, size: CoverSize): Promise<ActionResult> {
  if (size !== 'header' && size !== 'hero') return fail('Pick a cover size.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextCoverSizePreferences(auth.preferences, size)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the cover size. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set (or clear) the Space's BRAND ACCENT: a curated DAWN token NAME the profile shell paints as the
 * `--color-primary*` family (lib/spaces/accent.ts). An empty string CLEARS the accent (back to the
 * per-role default). The token is re-validated against the theme allowlist server-side, so only an
 * on-system token is ever stored (never a raw hex, D4/D6). Written to the `brand_accent` COLUMN (not
 * preferences); mirrors the basics form's accent write. Owner/admin/editor-gated. Returns ActionResult.
 */
export async function setSpaceAccent(slug: string, token: string): Promise<ActionResult> {
  const trimmed = token.trim()
  if (trimmed && !TOKEN_ALLOWLIST.has(trimmed)) return fail('Pick an accent from the list.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db
    .from('spaces')
    .update({ brand_accent: trimmed || null })
    .eq('id', auth.spaceId)
  if (error) return fail('Could not update the accent. Try again.')

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/** Resolve the Space's CURRENT landing doc (the stored + valid doc, else the generated preset), so a
 *  block edit operates on exactly what the panel shows. Then persist a NEW content array to the `puck`
 *  node + revalidate. Shared by the reorder + show/hide actions below. */
async function writeBlockContent(
  slug: string,
  auth: { spaceId: string; preferences: Record<string, unknown>; presetInput: SpacePresetInput },
  nextContent: unknown[],
): Promise<ActionResult> {
  const current = spacePuckData(auth.presetInput)
  const nextDoc: Data = {
    root: (current.root ?? {}) as Data['root'],
    content: nextContent as Data['content'],
  }
  // Re-validate the full doc against the current config (every block a known type) before storing.
  if (!isRenderableSpaceDoc(nextDoc)) return fail('That change could not be saved. Try again.')

  const preferences = { ...auth.preferences, puck: nextDoc }
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not save your changes. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Reorder a TOP-LEVEL block of the Space landing by one step (`dir` -1 up / +1 down), by `index` in the
 * CURRENT resolved doc. Non-destructive: it resolves the stored-or-preset doc, moves the one block, and
 * writes the new content to `preferences.puck` (so a preset the operator reorders becomes a customized
 * doc). Owner/admin/editor-gated. Returns ActionResult.
 */
export async function reorderSpaceBlock(
  slug: string,
  index: number,
  dir: -1 | 1,
): Promise<ActionResult> {
  if (dir !== -1 && dir !== 1) return fail('That change could not be saved. Try again.')
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const current = spacePuckData(auth.presetInput)
  const nextContent = moveBlock(current.content ?? [], index, dir)
  return writeBlockContent(slug, auth, nextContent)
}

/**
 * Show or hide a TOP-LEVEL block of the Space landing (`hidden` true = hide from the public page), by
 * `index` in the CURRENT resolved doc. Non-destructive: a hidden block stays in the stored doc with a
 * `hidden` flag (the public render path + full editor strip it), so it can be restored. Owner/admin/
 * editor-gated. Returns ActionResult.
 */
export async function setSpaceBlockHidden(
  slug: string,
  index: number,
  hidden: boolean,
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const current = spacePuckData(auth.presetInput)
  const nextContent = setBlockHidden(current.content ?? [], index, hidden)
  return writeBlockContent(slug, auth, nextContent)
}
