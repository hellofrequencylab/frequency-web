'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { isValidAccent } from '@/lib/spaces/accent'
import {
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
import { withProfileData, type ProfileDataPatch } from '@/lib/spaces/profile-data'
import { normalizeSpaceLocation } from '@/lib/spaces/location'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  nextCoverScrimPreferences,
  nextCoverFocusPreferences,
  type CoverScrim,
} from './preferences'
import {
  nextHeaderCtaPreferences,
  isHeaderCtaFunction,
  isValidCtaUrl,
  type HeaderCtaPreference,
} from '@/lib/spaces/header-cta'
import {
  sanitizeHeroConfig,
  nextHeroPreferences,
  readHeroConfig,
  type HeroConfig,
  type HeroHeight,
  type HeroButtonOrientation,
} from '@/lib/spaces/hero-config'

// SPACE PAGE / LAYOUT actions (the operator-composed multi-page profile). An owner / admin / editor
// manages their Space's public pages (cover size, brand accent, and the nav's pages) from
// /spaces/<slug>/manage/layout; block arrangement lives with the grid builder (saveSpaceGridLayout in
// ../../settings/profile/actions.ts). EVERY action RE-RESOLVES the space from the slug and
// RE-GATES caps.canEditProfile server-side, so a non-editor can never rewrite another space's pages
// (the route gate is UX; this is the authority). Staff preview (a janitor who is not an editor) is
// read-only: it has no canEditProfile, so every write below fails closed.
//
// NON-DESTRUCTIVE: each write touches only the one preferences node it owns (coverSize / the pages
// nav / a single branding node), preserving every other key. No em dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s space; returns the resolved
 *  space id + its current preferences blob, or null on any miss. Mirrors edit-page/actions.ts's shape
 *  intentionally (kept local so this file is self-contained, not coupled to the editor actions). */
async function authorizeEditor(slug: string): Promise<{
  spaceId: string
  preferences: Record<string, unknown>
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
 * Set the Hero cover SCRIM treatment ('none' clean photo · 'shade' dark scrim · 'blend' fade-to-canvas).
 * Owner/admin/editor-gated (staff preview fails closed). Only affects the Hero cover. Returns ActionResult.
 */
export async function setSpaceCoverScrim(slug: string, scrim: CoverScrim): Promise<ActionResult> {
  // Accept every CoverScrim the reader/render supports. 'none' was previously rejected here even though the
  // branding form offers it and preferences.ts renders it, so choosing "None" always failed to persist.
  if (scrim !== 'none' && scrim !== 'shade' && scrim !== 'blend') return fail('Pick a cover style.')

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
 * Set the Space HERO cover FOCAL POINT — where the cover image sits inside its cropped hero window, a CSS
 * `object-position` string ("x% y%") chosen with the shared ImageFocalPicker (the SAME control the admin
 * event rail uses). Stored on preferences.coverFocus (read-merge-write so every other preference survives;
 * the centered default is dropped so a plain Space keeps a sparse blob). This is a REPOSITION only — it
 * never touches the hero height or any layout node. Owner/admin/editor-gated (staff preview fails closed).
 * Returns ActionResult.
 */
export async function setSpaceCoverFocus(slug: string, focus: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextCoverFocusPreferences(auth.preferences, focus)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the cover position. Try again.')
  }

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set (or clear) the Space's HEADER CTA — the one dominant button on the profile hero. The owner picks
 * either an IN-HOUSE FUNCTION (booking / contact / tickets / donate / join / offerings, each linking to
 * a surface that already exists) with an optional custom label, or a CUSTOM LINK (their own URL + label).
 * Passing a null `pref` CLEARS the override, so the header falls back to the per-type default label + the
 * /book surface. The value is re-validated server-side (a known function key, or a safe http(s)/same-origin
 * URL + a non-empty label), so only a safe override is ever stored to preferences.headerCta. NON-DESTRUCTIVE:
 * only the headerCta node is touched. Owner/admin/editor-gated (staff preview fails closed). Returns
 * ActionResult.
 */
export async function setSpaceHeaderCta(
  slug: string,
  pref: HeaderCtaPreference | null,
): Promise<ActionResult> {
  // Re-validate the override server-side (the action is the authority, not the client form).
  let clean: HeaderCtaPreference | null = null
  if (pref && pref.kind === 'function') {
    if (!isHeaderCtaFunction(pref.function)) return fail('Pick a button action.')
    const label = typeof pref.label === 'string' ? pref.label.trim() : ''
    clean = { kind: 'function', function: pref.function, ...(label ? { label } : {}) }
  } else if (pref && pref.kind === 'custom') {
    const url = typeof pref.url === 'string' ? pref.url.trim() : ''
    const label = typeof pref.label === 'string' ? pref.label.trim() : ''
    if (!label) return fail('Give your button a label.')
    if (!isValidCtaUrl(url)) return fail('Enter a link that starts with https:// or /.')
    clean = { kind: 'custom', url, label }
  } else if (pref !== null) {
    return fail('Pick a button action.')
  }

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextHeaderCtaPreferences(auth.preferences, clean)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update your button. Try again.')
  }

  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set JUST the hero LOOK (height + button orientation), merged into the existing hero node. This NEVER
 * touches the header CTA — the CTA is owned by the separate "Header button" control (setSpaceHeaderCta),
 * so the two can be edited independently in the Identity & Branding section without clobbering each
 * other. Owner/editor-gated; sanitized to the sparse hero shape.
 */
export async function setSpaceHeroLook(
  slug: string,
  look: { height?: HeroHeight; buttonOrientation?: HeroButtonOrientation },
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const current = readHeroConfig(auth.preferences)
  const merged: HeroConfig = {
    ...current,
    ...(look.height !== undefined ? { height: look.height } : {}),
    ...(look.buttonOrientation !== undefined ? { buttonOrientation: look.buttonOrientation } : {}),
  }
  const cleanHero = sanitizeHeroConfig(merged)
  const next = nextHeroPreferences(auth.preferences, cleanHero)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not save. Try again.')
  }

  revalidatePath(`/spaces/${slug}`, 'layout')
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
  // token-ok: example hex shown in validation copy, not a style value
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
      return 'Add more pages with your own website. It comes with the Business plan.'
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

/**
 * Save WHERE THE SPACE IS, and how precisely it may be published (ADR-1026).
 *
 * Unlike almost every other write in this file, this one touches real COLUMNS rather than a node in
 * the `preferences` blob, because `spaces.geog` is a generated PostGIS point over latitude/longitude
 * and a jsonb key cannot carry a GiST index. Same gate as the rest: the space is re-resolved from the
 * slug and `caps.canEditProfile` is re-checked server-side, so a non-editor can never place a pin on
 * somebody else's Space and staff preview fails closed.
 *
 * 🔴 THE TRUE COORDINATE IS WHAT GETS STORED, EVEN WHEN THE OWNER PICKED 'approximate'. Storing only
 * the coarsened point would be the tidier-looking choice and it breaks the feature: the owner asked
 * to be able to ADJUST the pin, and a pin that re-coarsened itself on every save would drift a little
 * further from the truth each time it was opened. The coarsening therefore happens once, on the READ
 * path that publishes the pin (lib/nearby/map-pins.ts, via lib/maps/approximate.ts). Anything else
 * that reads these columns and publishes them owes the same duty.
 *
 * Clearing the pin (both coordinates null) is how a Space comes OFF the map, and the address fields
 * survive it: the Contact card still wants a street even when the venue does not want a dot.
 */
export async function setSpaceLocation(slug: string, input: unknown): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const location = normalizeSpaceLocation(input)

  const { error } = await createAdminClient()
    .from('spaces')
    .update({
      street: location.street,
      city: location.city,
      region: location.region,
      postal_code: location.postalCode,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      location_precision: location.precision,
    })
    .eq('id', auth.spaceId)

  if (error) return fail('Could not save your location. Try again.')

  // The pin feeds the Around You map, and the address feeds every public profile route's Contact
  // card, so both the community surface and the whole space layout have to be refreshed.
  revalidatePath(`/spaces/${slug}`, 'layout')
  revalidatePath(`/spaces/${slug}/settings/basics`)
  revalidatePath('/nearby')
  return ok()
}
