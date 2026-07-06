'use server'

import type { Data } from '@/lib/page-editor/types'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { isValidAccent } from '@/lib/spaces/accent'
import { isRenderableSpaceDoc } from '@/lib/page-editor/templates/space'
import { moveBlock, setBlockHidden } from '@/lib/page-editor/templates/space-blocks'
import {
  resolveSpacePageDoc,
  withPageDoc,
  hasPage,
  addPage,
  renamePage,
  removePage,
  reorderPages,
  planAddPage,
  type AddPageReason,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { withProfileData, type ProfileDataPatch, type SpaceOffering } from '@/lib/spaces/profile-data'
import {
  withLayoutPreset,
  withSpaceLayoutDefault,
  isLayoutPreset,
  type LayoutPreset,
} from '@/lib/spaces/layout-presets'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  nextCoverScrimPreferences,
  type CoverScrim,
} from './preferences'

// SPACE PAGE / LAYOUT actions (the operator-composed multi-page profile). An owner / admin / editor
// manages their Space's public pages (cover size, brand accent, block order + show/hide, and the
// nav's pages) from /spaces/<slug>/manage/layout. EVERY action RE-RESOLVES the space from the slug and
// RE-GATES caps.canEditProfile server-side, so a non-editor can never rewrite another space's pages
// (the route gate is UX; this is the authority). Staff preview (a janitor who is not an editor) is
// read-only: it has no canEditProfile, so every write below fails closed.
//
// NON-DESTRUCTIVE: each write touches only the one preferences node it owns (coverSize / a page's
// pageDoc / the pages nav), preserving every other key. No em dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s space; returns the resolved
 *  space id + its current preferences blob, or null on any miss. Mirrors edit-page/actions.ts's shape
 *  intentionally (kept local so this file is self-contained, not coupled to the editor actions). */
async function authorizeEditor(slug: string): Promise<{
  spaceId: string
  preferences: Record<string, unknown>
  /** The Space's display name, so a block edit can resolve the CURRENT page doc (stored-or-default)
   *  server-side before it reorders / toggles a block. */
  presetInput: { name: string }
  /** Whether the Space may add/manage EXTRA profile pages (the paid multi-page upsell, space_full_website).
   *  DEFAULT-DENY today, so only the one home page is allowed until billing grants the entitlement. */
  canUseFullWebsite: boolean
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
    presetInput: { name: space.brandName?.trim() || space.name },
    canUseFullWebsite: spaceCanUseFullWebsite(space),
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
 * Set a PAGE's layout TEMPLATE (single / main-side / two-col / three-col / header-side) - the DISPLAY
 * arrangement, kept separate from the neutral block content. Written to preferences.pageLayouts[pageSlug];
 * the public renderer arranges the same content for the template (applyLayoutPreset), so the operator
 * picks a layout without ever opening Puck. This "This page" scope overrides the space-level All-pages
 * default. Owner/admin/editor-gated (staff preview fails closed). Returns ActionResult.
 */
export async function setSpaceLayoutPreset(
  slug: string,
  pageSlug: string,
  preset: LayoutPreset,
): Promise<ActionResult> {
  if (!isLayoutPreset(preset)) return fail('Pick a layout.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = withLayoutPreset(auth.preferences, pageSlug, preset)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the layout. Try again.')
  }

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set the SPACE-LEVEL default layout TEMPLATE (the "All pages" scope). Written to the reserved
 * preferences.pageLayouts['*'] key (guarded from prototype pollution in layout-presets.ts); it applies
 * to every page that has no per-page template of its own. Owner/admin/editor-gated (staff preview fails
 * closed). Returns ActionResult.
 */
export async function setSpaceLayoutDefault(
  slug: string,
  preset: LayoutPreset,
): Promise<ActionResult> {
  if (!isLayoutPreset(preset)) return fail('Pick a layout.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = withSpaceLayoutDefault(auth.preferences, preset)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the layout. Try again.')
  }

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Save the Space's CENTRAL BUSINESS INFO (the single source of truth: address, hours, phone, email,
 * website, socials, rating, story). Written to preferences.profileData; every authored block reads it
 * off the shared metadata seam, so this ONE write updates the address / story / links on every block
 * and every surface at once (owner directive: "change it and it changes everywhere"). NON-DESTRUCTIVE:
 * only the profileData node is touched (withProfileData preserves every other key + drops cleared
 * fields). Owner/admin/editor-gated (staff preview fails closed). Returns ActionResult.
 */
export async function setSpaceBusinessInfo(slug: string, patch: ProfileDataPatch): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = withProfileData(auth.preferences, patch)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not save your business info. Try again.')
  }

  // The profile data shows across every public profile route (Home + custom pages + the Spotlight),
  // so revalidate the whole space layout, not just the landing.
  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Save the Space's SERVICES catalog (the storefront store items) as a whole list. Written to
 * preferences.profileData.offerings through the SAME single-source normalizer as the business info
 * (withProfileData re-parses every row fail-safe, coercing prices + dropping unknown enums), so a
 * listed service shows on the public storefront and a private one stays direct-link only. This is a
 * FOCUSED patch: it touches only the offerings node, preserving every other profileData + preferences
 * key. Owner/admin/editor-gated (staff preview fails closed). Returns ActionResult.
 */
export async function setSpaceServices(slug: string, services: SpaceOffering[]): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const list = Array.isArray(services) ? services : []
  const next = withProfileData(auth.preferences, { offerings: list } as ProfileDataPatch)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not save your services. Try again.')
  }

  // Services show on the public storefront (every profile route) + the manage surfaces.
  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/settings/services`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set the Space's HEADER (cover) and PROFILE (logo) images. Each is a public URL the operator uploaded
 * through the shared ImageUpload control (or a pasted URL); an empty string CLEARS that image back to
 * the placeholder. Written to the cover_image_url / brand_logo_url COLUMNS (mirrors setSpaceAccent's
 * column write). Owner/admin/editor-gated (staff preview fails closed). Only the provided keys are
 * written, so a caller can update one image without disturbing the other. Returns ActionResult.
 */
export async function setSpaceImages(
  slug: string,
  images: { coverImageUrl?: string | null; brandLogoUrl?: string | null },
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const patch: Record<string, unknown> = {}
  if ('coverImageUrl' in images) patch.cover_image_url = images.coverImageUrl?.trim() || null
  if ('brandLogoUrl' in images) patch.brand_logo_url = images.brandLogoUrl?.trim() || null
  if (Object.keys(patch).length === 0) return ok()

  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update(patch).eq('id', auth.spaceId)
  if (error) return fail('Could not save your images. Try again.')

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Upload a Space HEADER (cover) or PROFILE (logo) image and return its public URL. The operator picks a
 * file in the customize rail; the upload runs SERVER-SIDE with the service role, so it never depends on a
 * live browser storage session (the fragile path that returned "new row violates row-level security
 * policy" when the browser token failed to reach Storage). It writes to a SPACE-scoped path
 * (spaces/<id>/covers|logos/...), so any manager/editor of the space can set it, not just the original
 * uploader, and the object belongs to the space rather than one person's uid prefix. The public bucket
 * serves the returned URL; the caller persists it via setSpaceImages. Owner/admin/editor-gated (staff
 * preview fails closed). Returns the public URL or a plain error.
 */
export async function uploadSpaceImage(
  slug: string,
  kind: 'cover' | 'logo',
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  if (kind !== 'cover' && kind !== 'logo') return { error: 'Pick an image to upload.' }

  const auth = await authorizeEditor(slug)
  if (!auth) return { error: 'You do not have access to edit this page.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const folder = kind === 'cover' ? 'covers' : 'logos'
  const path = `spaces/${auth.spaceId}/${folder}/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true })
  if (error) return { error: error.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)
  return { url: data.publicUrl }
}

/**
 * Upload an image for a PROFILE BLOCK (a Callout image, or an Image gallery photo; ADR-542) and return its
 * public URL. Reuses the SAME server-side, service-role upload path as the cover/logo (uploadSpaceImage):
 * the public `event-media` bucket under a space-scoped path (spaces/<id>/blocks/...), so it never depends on
 * a live browser Storage session and invents no new bucket. The caller (the in-rail block editor) writes the
 * returned URL into the block's authored content bag. Owner/admin/editor-gated (staff preview fails closed).
 */
export async function uploadSpaceBlockImage(
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const auth = await authorizeEditor(slug)
  if (!auth) return { error: 'You do not have access to edit this page.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `spaces/${auth.spaceId}/blocks/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true })
  if (error) return { error: error.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)
  return { url: data.publicUrl }
}

/**
 * Set the Hero cover SCRIM treatment ('shade' dark scrim vs 'blend' fade-to-canvas). Owner/admin/
 * editor-gated (staff preview fails closed). Only affects the Hero cover size. Returns ActionResult.
 */
export async function setSpaceCoverScrim(slug: string, scrim: CoverScrim): Promise<ActionResult> {
  if (scrim !== 'shade' && scrim !== 'blend') return fail('Pick a cover style.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextCoverScrimPreferences(auth.preferences, scrim)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the cover style. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set (or clear) the Space's BRAND ACCENT: a curated DAWN token NAME or a 6-digit hex the owner picked
 * (ADR-516 D2). The profile shell paints it as the `--color-primary*` family (lib/spaces/accent.ts). An
 * empty string CLEARS the accent (back to the per-role default). The value is re-validated server-side
 * (isValidAccent: an allowlisted token or a strict `#rrggbb`), so only a safe accent is ever stored.
 * Written to the `brand_accent` COLUMN (not preferences); mirrors the basics form's accent write.
 * Owner/admin/editor-gated. Returns ActionResult.
 */
export async function setSpaceAccent(slug: string, token: string): Promise<ActionResult> {
  const trimmed = token.trim()
  if (trimmed && !isValidAccent(trimmed)) return fail('Pick a brand color, or enter a hex like #E2912F.')

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

/**
 * Publish or unpublish the Space's EXTERNAL website (ADR-508 U4-B). Written as a boolean to
 * preferences.websitePublished; the public /sites/<slug> route is FAIL-CLOSED on it (network-visible
 * AND published, else 404 + noindex). NON-DESTRUCTIVE: only the websitePublished node is written, every
 * other preferences key preserved. Owner/admin/editor-gated (staff preview fails closed). Revalidates
 * the public site + the in-app profile so the state flips immediately. Returns ActionResult.
 */
export async function setWebsitePublished(slug: string, published: boolean): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = { ...auth.preferences, websitePublished: published === true }
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update your website. Try again.')
  }

  revalidatePath(`/sites/${slug}`)
  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/** The public path a page renders at: Home at the profile index, a custom page under its slug. */
function pagePath(slug: string, pageSlug: string): string {
  return pageSlug === HOME_SLUG ? `/spaces/${slug}` : `/spaces/${slug}/${pageSlug}`
}

/** Resolve a specific PAGE's CURRENT doc (the stored + valid doc for that page, else the universal
 *  default), so a block edit operates on exactly what the panel shows for the selected page. Then
 *  persist a NEW content array to THAT page's doc under `pageDocs` + revalidate. Shared by the reorder +
 *  show/hide actions below. */
async function writeBlockContent(
  slug: string,
  pageSlug: string,
  auth: { spaceId: string; preferences: Record<string, unknown>; presetInput: { name: string } },
  nextContent: unknown[],
): Promise<ActionResult> {
  const current = resolveSpacePageDoc(auth.preferences, auth.presetInput.name, pageSlug)
  const nextDoc: Data = {
    root: (current.root ?? {}) as Data['root'],
    content: nextContent as Data['content'],
  }
  // Re-validate the full doc against the current config (every block a known type) before storing.
  if (!isRenderableSpaceDoc(nextDoc)) return fail('That change could not be saved. Try again.')

  const preferences = withPageDoc(auth.preferences, pageSlug, nextDoc)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not save your changes. Try again.')
  }

  revalidatePath(pagePath(slug, pageSlug))
  revalidatePath(`/spaces/${slug}/edit-page`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Reorder a TOP-LEVEL block of a Space PAGE by one step (`dir` -1 up / +1 down), by `index` in the
 * CURRENT resolved doc for `pageSlug` (default Home). Non-destructive: it resolves the stored-or-default
 * doc, moves the one block, and writes the new content to `pageDocs[pageSlug]` (so a default page the
 * operator reorders becomes a stored doc). The page must exist. Owner/admin/editor-gated. Returns
 * ActionResult.
 */
export async function reorderSpaceBlock(
  slug: string,
  index: number,
  dir: -1 | 1,
  pageSlug: string = HOME_SLUG,
): Promise<ActionResult> {
  if (dir !== -1 && dir !== 1) return fail('That change could not be saved. Try again.')
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')
  if (!hasPage(auth.preferences, pageSlug)) return fail('That page no longer exists.')

  const current = resolveSpacePageDoc(auth.preferences, auth.presetInput.name, pageSlug)
  const nextContent = moveBlock(current.content ?? [], index, dir)
  return writeBlockContent(slug, pageSlug, auth, nextContent)
}

/**
 * Show or hide a TOP-LEVEL block of a Space PAGE (`hidden` true = hide from the public page), by `index`
 * in the CURRENT resolved doc for `pageSlug` (default Home). Non-destructive: a hidden block stays in the
 * stored doc with a `hidden` flag (the public render path + full editor strip it), so it can be restored.
 * The page must exist. Owner/admin/editor-gated. Returns ActionResult.
 */
export async function setSpaceBlockHidden(
  slug: string,
  index: number,
  hidden: boolean,
  pageSlug: string = HOME_SLUG,
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')
  if (!hasPage(auth.preferences, pageSlug)) return fail('That page no longer exists.')

  const current = resolveSpacePageDoc(auth.preferences, auth.presetInput.name, pageSlug)
  const nextContent = setBlockHidden(current.content ?? [], index, hidden)
  return writeBlockContent(slug, pageSlug, auth, nextContent)
}

// ── THE NAV MANAGER actions (multi-page model). Create / rename / reorder / delete the operator-defined
// profile pages. Each calls a PURE mutator from profile-pages.ts and writes the WHOLE preferences blob
// back, re-gating canEditProfile server-side (owner/admin/editor). Guardrails from the research: Home is
// required + non-deletable; a reserved / invalid / duplicate slug is rejected with a plain message; the
// nav is capped at MAX_PROFILE_PAGES. Copy is plain, sentence-case, no em dashes (CONTENT-VOICE §10).

/** Revalidate the surfaces a nav change touches: the whole profile subtree (the nav renders on every
 *  page) + the Page manager. */
function revalidateNav(slug: string): void {
  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
}

/** Map a rejected AddPagePlan to plain, member-facing copy (CONTENT-VOICE §10, no em dashes). */
function addPageError(reason: AddPageReason): string {
  switch (reason) {
    case 'empty':
      return 'Give your page a name.'
    case 'unsluggable':
      return 'Use letters or numbers in the page name.'
    case 'reserved':
      return 'That name is reserved. Pick a different one.'
    case 'invalid':
      return 'Pick a shorter, simpler page name.'
    case 'duplicate':
      return 'You already have a page with that name.'
    case 'cap':
      return `You can have up to ${MAX_PROFILE_PAGES} pages. Delete one to add another.`
    case 'locked':
      return 'Add more pages with your own website. Upgrade your plan to unlock it.'
  }
}

/**
 * Create a new custom profile page from a human LABEL (its slug is derived + validated by the pure
 * planAddPage guardrail). Rejects, with a plain message, an empty / reserved / invalid / duplicate slug,
 * or a nav already at the page cap. On success returns the created slug in `ok(slug)` so the caller can
 * switch to the new page. Owner/admin/editor-gated.
 */
export async function createSpacePage(slug: string, label: string): Promise<ActionResult<string>> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const plan = planAddPage(auth.preferences, label, MAX_PROFILE_PAGES, auth.canUseFullWebsite)
  if (!plan.ok) return fail(addPageError(plan.reason))

  const preferences = addPage(auth.preferences, plan.slug, plan.label, auth.canUseFullWebsite)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not add the page. Try again.')
  }
  revalidateNav(slug)
  return ok(plan.slug)
}

/**
 * Rename any page's nav label (Home included). The slug (and its URL) never changes. A blank label is
 * rejected. Owner/admin/editor-gated.
 */
export async function renameSpacePage(
  slug: string,
  pageSlug: string,
  label: string,
): Promise<ActionResult> {
  const trimmed = label.trim()
  if (!trimmed) return fail('Give your page a name.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')
  if (!hasPage(auth.preferences, pageSlug)) return fail('That page no longer exists.')

  const preferences = renamePage(auth.preferences, pageSlug, trimmed)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not rename the page. Try again.')
  }
  revalidateNav(slug)
  return ok()
}

/**
 * Reorder the nav to the given slug order. Home is always pinned first regardless of input (the pure
 * mutator enforces it); unknown slugs are dropped and omitted pages keep their relative order after the
 * listed ones. Owner/admin/editor-gated.
 */
export async function reorderSpacePages(slug: string, order: string[]): Promise<ActionResult> {
  if (!Array.isArray(order)) return fail('That change could not be saved. Try again.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const preferences = reorderPages(auth.preferences, order)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not reorder your pages. Try again.')
  }
  revalidateNav(slug)
  return ok()
}

/**
 * Delete a custom profile page and drop its stored doc. Home can NEVER be deleted (the required index);
 * the request fails plainly. Owner/admin/editor-gated.
 */
export async function deleteSpacePage(slug: string, pageSlug: string): Promise<ActionResult> {
  if (pageSlug.trim().toLowerCase() === HOME_SLUG) return fail('Home is your main page and cannot be deleted.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')
  if (!hasPage(auth.preferences, pageSlug)) return fail('That page no longer exists.')

  const preferences = removePage(auth.preferences, pageSlug)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not delete the page. Try again.')
  }
  revalidateNav(slug)
  return ok()
}
