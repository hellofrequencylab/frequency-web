'use server'

// CLIENT-CALLABLE READ GETTERS for the inline-first admin rail (ADR-514). The standardized admin bar
// renders the Space's config surfaces (Basics / Page / Mode) INLINE, but those editors were built as
// SERVER-fed pages. These getters let the client bar's thin wrapper modules self-fetch exactly the prop
// bundle each editor's page assembles, mirroring the circle-settings-module pattern
// (components/admin/modules/circle-settings-module.tsx → getCircleAdminData):
//   • each RE-GATES server-side (resolveSpaceManageAccess, plus the same per-Space function check the
//     page uses) and returns NULL when the viewer cannot manage — so the wrapper renders nothing
//     (fail-safe: a flattened bar never weakens a gate);
//   • each returns only SERIALIZABLE data (plain values crossing the RSC boundary; no React, no Icons);
//   • these are READ-ONLY — no write action changes. SpaceSettingsForm / SpacePagePanel / ModeSettings
//     already re-gate their own writes server-side, so this is convenience over an unchanged authority.
//
// Co-located under the Space manage tree beside the layout + mode actions these mirror.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import {
  resolveSpaceManageAccess,
  getSpaceCapabilities,
  spaceCanUseFullWebsite,
} from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { listSpaceAvailability } from '@/lib/spaces/booking'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { listAllTicketTiers } from '@/lib/spaces/tickets'
import { getDeals } from '@/lib/crm/pipeline'
import { listSpaceCampaigns } from '@/lib/spaces/campaigns'
import {
  readProfilePages,
  hasPage,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { readCoverScrim } from './layout/preferences'
import { readHeaderCtaPreference, type HeaderCtaPreference } from '@/lib/spaces/header-cta'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { partitionSpaceBlocks } from '@/lib/entity-blocks/space-blocks'
import {
  existingFunctionBackedBlocks,
  spaceBlockPickerData,
  FUNCTION_BACKED_BLOCK_TYPES,
  type BlockPickerData,
} from '@/lib/entity-blocks/block-data-sources'
import { PICKER_DATA_BLOCK_IDS } from '@/lib/entity-blocks/block-content'
import { parseEntityLayout, resolveRows, type RowDef } from '@/lib/entity-blocks/layout'
import { readHeroConfig, heroCtaFromPreference } from '@/lib/spaces/hero-config'
import type { HeroEditorValues } from '@/components/spaces/hero-edit-panel'
import { readProfileData, isServiceListed, type SpaceProfileData } from '@/lib/spaces/profile-data'
import { readWebsitePublished } from '@/lib/spaces/website'
import { parseSpaceTheme, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { SpaceSettingsValues } from '../settings/settings-form'

// ── Basics (space.basics) ──────────────────────────────────────────────────────────────────────────
// The SpaceSettingsForm prop bundle the /settings/basics page assembles (basics/page.tsx). Read-gated on
// manage access; the form's own updateSpaceProfile re-checks canEditProfile, so readOnly is UX.

interface SpaceBasicsData {
  spaceId: string
  slug: string
  initial: SpaceSettingsValues
  /** The central business blob (Story + contact + socials) the Business info form edits alongside the
   *  profile columns (the profile+identity rework — Section 1 is every WORD in one place). */
  business: SpaceProfileData
  readOnly: boolean
}

type ExtraRow = { about?: string | null; tagline?: string | null; visibility?: string | null }

/** Read the not-yet-typed profile columns (about / tagline / visibility) for a Space id (ADR-246). */
async function readProfileExtras(spaceId: string): Promise<ExtraRow> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('about, tagline, visibility')
      .eq('id', spaceId)
      .maybeSingle()) as { data: ExtraRow | null }
    return data ?? {}
  } catch {
    return {}
  }
}

// ── Shared resolve + pure builders (ADR-550) ─────────────────────────────────────────────────────────
// Each rail getter below resolves the SAME heavy chain (caller → visible space → manage access → caps →
// extras) and then assembles its per-module bundle. The standardized rail mounts ~5 of these modules,
// each a SEPARATE server action, so React's per-request cache never dedupes the chain across them — the
// slow rail. getSpaceRailBundle runs the resolve ONCE and calls the SAME pure `buildXData` helpers below,
// so the bundle and the individual getters can never drift. Each getter stays for isolation (a module
// mounted outside the rail, or a bundle miss, self-fetches exactly as before).

type ResolvedSpaceRow = NonNullable<Awaited<ReturnType<typeof getVisibleSpaceBySlug>>>
type SpaceCaps = Awaited<ReturnType<typeof getSpaceCapabilities>>

/** Assemble the Basics bundle from the already-resolved space/caps/extras. Pure + synchronous, shared by
 *  getSpaceBasicsData and getSpaceRailBundle so the two never drift. */
function buildBasicsData(
  space: ResolvedSpaceRow,
  caps: SpaceCaps,
  staffViewing: boolean,
  extras: ExtraRow,
): SpaceBasicsData {
  const canUseProfile = staffViewing || spaceFunctionAccess(space, 'profile', caps.role)
  const initial: SpaceSettingsValues = {
    brandName: space.brandName ?? '',
    brandAccent: space.brandAccent ?? '',
    brandLogoUrl: space.brandLogoUrl ?? '',
    coverImageUrl: space.coverImageUrl ?? '',
    about: extras.about ?? '',
    tagline: extras.tagline ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
    theme: parseSpaceTheme(space.preferences),
  }
  return {
    spaceId: space.id,
    slug: space.slug,
    initial,
    business: readProfileData(space.preferences),
    readOnly: staffViewing || !canUseProfile,
  }
}

/** The Basics editor's data, or null when the viewer cannot manage this Space (fail-safe → the wrapper
 *  renders nothing). Re-gates exactly like basics/page.tsx: resolveSpaceManageAccess + the `profile`
 *  per-Space function (read-only when the viewer lacks it or is a staff previewer). */
export async function getSpaceBasicsData(slug: string): Promise<SpaceBasicsData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const [caps, extras] = await Promise.all([
    getSpaceCapabilities(space, viewerProfileId),
    readProfileExtras(space.id),
  ])
  return buildBasicsData(space, caps, staffViewing, extras)
}

// ── Identity & Branding (space.branding) ─────────────────────────────────────────────────────────────
// The Identity & Branding form bundle (Section 1 of the standardized rail, ADR-535): everything that shows
// in the header HERO — brand name, tagline, header + logo images, the Hero cover style, and the brand
// accent. Read-gated exactly like Info & Connect (manage access + the `profile` function); each control
// re-gates its own write server-side.

interface SpaceBrandingData {
  spaceId: string
  slug: string
  brandName: string
  tagline: string
  coverImageUrl: string | null
  brandLogoUrl: string | null
  coverScrim: ReturnType<typeof readCoverScrim>
  accent: string
  /** The owner's saved header-CTA override (preferences.headerCta), or null when unset (the header uses
   *  the per-type default). Serializable, so it crosses the RSC boundary to the branding form. */
  headerCta: HeaderCtaPreference | null
  /** The per-type default CTA label, shown as the placeholder when no override is set. */
  defaultCtaLabel: string
  /** The Space PAGE STYLE (ADR-578): the typography + shape identity id (preferences.theme), so the rail's
   *  Identity & Branding section can render the 5-option style chooser with the current pick selected. */
  pageTheme: SpaceThemeId
  readOnly: boolean
}

/** Assemble the Identity & Branding bundle from the already-resolved space/caps/extras. Pure, shared by
 *  getSpaceBrandingData and getSpaceRailBundle. */
function buildBrandingData(
  space: ResolvedSpaceRow,
  caps: SpaceCaps,
  staffViewing: boolean,
  extras: ExtraRow,
): SpaceBrandingData {
  const canUseProfile = staffViewing || spaceFunctionAccess(space, 'profile', caps.role)
  return {
    spaceId: space.id,
    slug: space.slug,
    brandName: space.brandName ?? '',
    tagline: extras.tagline ?? '',
    coverImageUrl: space.coverImageUrl ?? null,
    brandLogoUrl: space.brandLogoUrl ?? null,
    coverScrim: readCoverScrim(space.preferences),
    accent: space.brandAccent ?? '',
    headerCta: readHeaderCtaPreference(space.preferences),
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
    pageTheme: parseSpaceTheme(space.preferences),
    readOnly: staffViewing || !canUseProfile,
  }
}

/** The Identity & Branding editor's data, or null when the viewer cannot manage this Space (fail-safe →
 *  the wrapper renders nothing). Mirrors getSpaceBasicsData's gate. */
export async function getSpaceBrandingData(slug: string): Promise<SpaceBrandingData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const [caps, extras] = await Promise.all([
    getSpaceCapabilities(space, viewerProfileId),
    readProfileExtras(space.id),
  ])
  return buildBrandingData(space, caps, staffViewing, extras)
}

// ── Settings (space.settings) ────────────────────────────────────────────────────────────────────────
// The lower Settings section (ADR-535): the less-frequent knobs pulled OUT of the forward-facing sections —
// the star rating + count, and who can find this space (visibility). Read-gated like Info & Connect; each
// write re-gates server-side.

interface SpaceSettingsData {
  spaceId: string
  slug: string
  rating: string
  ratingCount: string
  visibility: 'network' | 'private'
  readOnly: boolean
}

/** Assemble the Settings bundle from the already-resolved space/caps/extras. Pure, shared by
 *  getSpaceSettingsData and getSpaceRailBundle. */
function buildSettingsData(
  space: ResolvedSpaceRow,
  caps: SpaceCaps,
  staffViewing: boolean,
  extras: ExtraRow,
): SpaceSettingsData {
  const canUseProfile = staffViewing || spaceFunctionAccess(space, 'profile', caps.role)
  const business = readProfileData(space.preferences)
  return {
    spaceId: space.id,
    slug: space.slug,
    rating: business.rating ?? '',
    ratingCount: business.ratingCount ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
    readOnly: staffViewing || !canUseProfile,
  }
}

/** The Settings section's data, or null when the viewer cannot manage this Space (fail-safe). */
export async function getSpaceSettingsData(slug: string): Promise<SpaceSettingsData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const [caps, extras] = await Promise.all([
    getSpaceCapabilities(space, viewerProfileId),
    readProfileExtras(space.id),
  ])
  return buildSettingsData(space, caps, staffViewing, extras)
}

// ── Page (space.layout) ──────────────────────────────────────────────────────────────────────────────
// The SpacePagePanel prop bundle the /manage/layout page assembles (manage/layout/page.tsx). Read-gated
// on manage access; every write re-gates canEditProfile in its own action, so readOnly is UX.

interface SpacePageData {
  slug: string
  pages: ReturnType<typeof readProfilePages>
  activePageSlug: string
  maxPages: number
  coverScrim: ReturnType<typeof readCoverScrim>
  accent: string
  businessInfo: SpaceProfileData
  coverImageUrl: string | null
  brandLogoUrl: string | null
  websitePublished: boolean
  canManagePages: boolean
  readOnly: boolean
}

/** The Page editor's data, or null when the viewer cannot manage this Space / the type has no console
 *  (fail-safe). `pageSlug` picks which page's blocks the panel edits (default Home), mirroring the
 *  page's `?page=` param. Re-gates exactly like manage/layout/page.tsx. */
/** Assemble the Page bundle from the already-resolved space + access flags, or null when the type has no
 *  console (fail-safe). Pure, shared by getSpacePageData and getSpaceRailBundle. `pageSlug` picks which
 *  page's blocks the panel edits (default Home). */
function buildPageData(
  space: ResolvedSpaceRow,
  staffViewing: boolean,
  canManage: boolean,
  pageSlug?: string,
): SpacePageData | null {
  if (!isConsoleSpaceType(space.type)) return null

  const coverScrim = readCoverScrim(space.preferences)
  const pages = readProfilePages(space.preferences)
  const requested = (pageSlug ?? HOME_SLUG).trim().toLowerCase()
  const activePageSlug = hasPage(space.preferences, requested) ? requested : HOME_SLUG

  return {
    slug: space.slug,
    pages,
    activePageSlug,
    maxPages: MAX_PROFILE_PAGES,
    coverScrim,
    accent: space.brandAccent ?? '',
    businessInfo: readProfileData(space.preferences),
    coverImageUrl: space.coverImageUrl ?? null,
    brandLogoUrl: space.brandLogoUrl ?? null,
    websitePublished: readWebsitePublished(space.preferences),
    canManagePages: spaceCanUseFullWebsite(space),
    readOnly: staffViewing && !canManage,
  }
}

export async function getSpacePageData(
  slug: string,
  pageSlug?: string,
): Promise<SpacePageData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  return buildPageData(space, staffViewing, canManage, pageSlug)
}

// ── The in-rail Space page builder seed (ADR-516 Phase D) ────────────────────────────────────────────
// The Space builder + the owner's live page preview seed the shared entity-layout store from the SAME
// persisted layout (spaces.preferences.profileLayout), resolved to the freeform rows for the space kind.
// RE-GATES on manage access (canManage; a staff previewer cannot edit the page, so gets no builder) and
// returns NULL otherwise (fail-safe → the builder renders nothing). READ-ONLY + serializable (RowDef is
// plain data), so the client builder self-fetches it exactly like the personal Layout getter.

interface SpaceLayoutRailData {
  /** The Space slug — the builder guards that this matches the page it is mounted on (self-owner). */
  slug: string
  /** The persisted freeform rows (resolveRows over the saved profileLayout → the basic starter when empty). */
  rows: RowDef[]
  /** The persisted hidden block ids (blocks kept in place but off the render). */
  hidden: string[]
  /** Whether the space has ever saved a layout (else the resolved rows are the default seed → show starters). */
  customized: boolean
  /** Space blocks locked behind a function this space does not have on, OR (ADR-573 item 6) a function-backed
   *  block that has no data yet — held out of the picker + bench until the function exists AND has items. */
  lockedIds: string[]
  /** The edit-panel PICKER payload per function-backed block (ADR-573 item 5): the Space's live items + the
   *  create link. Keyed by block id; a block absent here has no picker. Serializable (plain data). */
  pickerData: Record<string, BlockPickerData>
  /** The pinned Top Hero's current values (operator overrides, else the Space's brand name / tagline), so the
   *  fixed hero editor opens showing what is on the page. Serializable (plain strings). */
  hero: HeroEditorValues
}

/** Assemble the builder seed from the already-resolved space, or null when the viewer cannot manage this
 *  Space (fail-safe → the builder renders nothing). Shared by getSpaceLayoutRailData and getSpaceRailBundle.
 *  A staff previewer cannot edit the page, so `canManage` gates it (not staffViewing). ASYNC (ADR-573): it
 *  now reads the Space's function-backed data twice, both bound to space.id and both fail-safe:
 *   • item 6 — existingFunctionBackedBlocks(space.id) → the finer palette gate (a function-backed block is
 *     locked until it EXISTS + has items), composed with the switch gate in partitionSpaceBlocks.
 *   • item 5 — spaceBlockPickerData(space.id, slug, PICKER_DATA_BLOCK_IDS) → the picker choices + create link
 *     for each data-source-backed block. */
async function buildLayoutData(space: ResolvedSpaceRow, canManage: boolean): Promise<SpaceLayoutRailData | null> {
  if (!canManage) return null

  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const saved = parseEntityLayout(rawLayout)

  // item 6 (existing-function gate) + item 5 (picker data) resolve independently — one parallel pass on the
  // rail's open path. Both are fail-safe (a reader that throws yields an empty set / empty item list), so a
  // transient miss degrades to "the block stays locked" / "the picker shows the create link", never a crash.
  const [existing, pickerData] = await Promise.all([
    existingFunctionBackedBlocks(space.id),
    spaceBlockPickerData(space.id, space.slug, PICKER_DATA_BLOCK_IDS),
  ])
  const { lockedIds } = partitionSpaceBlocks(enabledFunctionKeys(space), {
    functionBacked: new Set(FUNCTION_BACKED_BLOCK_TYPES),
    existing,
  })

  // The pinned Top Hero seed: the operator's hero overrides (preferences.hero) atop the Space's canonical
  // brand name / tagline, plus the existing header-CTA (relocated into the hero editor, item 5) split back to
  // the editor's flat {label, url}. A blank override falls back to the Space value, so the editor opens showing
  // exactly what the cover paints.
  const heroConfig = readHeroConfig(prefs)
  const cta = heroCtaFromPreference(readHeaderCtaPreference(prefs))
  const hero: HeroEditorValues = {
    height: heroConfig.height,
    buttonOrientation: heroConfig.buttonOrientation,
    eyebrow: heroConfig.eyebrow,
    heading: heroConfig.heading ?? space.brandName ?? space.name,
    tagline: heroConfig.tagline ?? space.tagline ?? undefined,
    ctaLabel: cta.label || undefined,
    ctaUrl: cta.url || undefined,
  }

  return {
    slug: space.slug,
    rows: resolveRows(saved, 'space'),
    hidden: saved?.hidden ?? [],
    customized: !!(saved && (saved.rows?.length || saved.template || saved.slots || saved.order)),
    lockedIds,
    pickerData,
    hero,
  }
}

/** The Space's own resolved profile-page layout for the builder, or null when the viewer cannot manage
 *  this Space (fail-safe → the builder renders nothing). */
export async function getSpaceLayoutRailData(slug: string): Promise<SpaceLayoutRailData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  return buildLayoutData(space, canManage)
}

// ── The one bundled rail resolve (ADR-550) ───────────────────────────────────────────────────────────
// The standardized Space rail mounts the Basics / Branding / Settings / Page modules + the page builder,
// each of which self-fetches through its OWN 'use server' action above — so the heavy resolve chain
// (caller → visible space → manage access → caps → extras) runs ~5 times per rail open, with no cross-
// request dedupe. This getter runs that chain ONCE and assembles every per-module bundle from the SAME
// pure builders the individual getters use, so there is zero behavior drift. It SELF-GATES identically
// (returns null for a non-manager / non-staff viewer, the fail-safe), and each write action still
// re-gates on its own. The client SpaceRailDataProvider calls this once and distributes the slices;
// a module that misses the provider falls back to its own getter, so nothing breaks standalone.

export interface SpaceRailBundle {
  /** Present whenever the viewer can manage (the `profile` function only toggles readOnly). */
  basics: SpaceBasicsData
  branding: SpaceBrandingData
  settings: SpaceSettingsData
  /** Null when the Space type has no console (mirrors getSpacePageData). */
  page: SpacePageData | null
  /** Null when the viewer is a staff previewer who cannot edit (mirrors getSpaceLayoutRailData). */
  layout: SpaceLayoutRailData | null
}

/** Every Space rail module's bundle from ONE resolve, or null when the viewer cannot manage this Space
 *  (fail-safe → every module renders nothing). Re-gates EXACTLY like the individual getters. */
export async function getSpaceRailBundle(
  slug: string,
  pageSlug?: string,
): Promise<SpaceRailBundle | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  // caps + extras are INDEPENDENT (each needs only space / viewerProfileId), so resolve them in parallel
  // rather than serially — one round-trip instead of two on the rail's hot open path (ADR-550). caps reads
  // the viewer's membership, which resolveSpaceManageAccess already read, so React.cache serves it free.
  const [caps, extras, layout] = await Promise.all([
    getSpaceCapabilities(space, viewerProfileId),
    readProfileExtras(space.id),
    // The layout slice now reads the Space's function-backed data (item 5 picker data + item 6 existing gate),
    // so it is async; resolve it alongside caps + extras on the rail's hot open path (ADR-573).
    buildLayoutData(space, canManage),
  ])

  return {
    basics: buildBasicsData(space, caps, staffViewing, extras),
    branding: buildBrandingData(space, caps, staffViewing, extras),
    settings: buildSettingsData(space, caps, staffViewing, extras),
    page: buildPageData(space, staffViewing, canManage, pageSlug),
    layout,
  }
}

// NOTE: Space Mode is a creation-time PRESET (framing/labels/pipeline seed) and is edited on the full
// `/spaces/<slug>/manage/mode` page reachable from the manage console. The rail no longer surfaces it: the
// former inline `SpaceModeModule` and the "Starter" chip (getSpaceStarterChip) were removed (ADR-527) once
// universal functions + the freeform layout editor made Mode purely a starting preset, not a rail control.

// ── Rail summary getters (Phase 2 "keep it in the rail") ─────────────────────────────────────────────
// TINY, serializable, fail-safe reads that feed the primary feature link-rows their glanceable inline
// stat (SURFACE_SUMMARIES in components/admin/modules/surface-summaries.ts). Each RE-GATES exactly like
// getSpaceBasicsData — resolveSpaceManageAccess plus (when the surface carries one) the same per-Space
// function the surface's page re-checks — and returns null when the viewer cannot manage / cannot use the
// tool, so the summary card degrades to a plain link-row (never a broken card, never a weakened gate).
// They return only a `{ count }` (or the identity strip's plain strings) — no React, no Icons, no copy;
// the singular/plural COPY lives with the client-boundary map. The Space read is React.cache()d, so these
// dedupe on the one cached row.

type ResolvedSpace = NonNullable<Awaited<ReturnType<typeof getVisibleSpaceBySlug>>>

/** Re-gate a Space for a rail summary read: manage access (fail-safe → null) plus, when the surface
 *  carries a per-Space function, the SAME `spaceFunctionAccess` check its page re-runs (a staff previewer
 *  passes, mirroring getSpaceBasicsData). Returns the cached Space row on success, else null. */
async function resolveSummarySpace(
  slug: string,
  requiredFunction: SpaceFunctionKey | null,
): Promise<ResolvedSpace | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  if (requiredFunction) {
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    if (!staffViewing && !spaceFunctionAccess(space, requiredFunction, caps.role)) return null
  }
  return space
}

/** "N members" — active memberships only. Gated on manage access + the `members` function. Fail-safe. */
export async function getSpaceMembersSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'members')
  if (!space) return null
  const members = await listSpaceMembers(space.id)
  return { count: members.filter((m) => m.status === 'active').length }
}

/** "N in your pipeline" — the Space's CRM deals. Gated on manage access + the `crm` function. The lean
 *  read (getDeals, one query) over the 4-read funnel. Returns the Space plan `tier` too, so the inline
 *  usage meter (ADR-520 P2) can place the count against the plan's allowance. Fail-safe. */
export async function getSpaceCrmSummary(slug: string): Promise<{ count: number; tier: string } | null> {
  const space = await resolveSummarySpace(slug, 'crm')
  if (!space) return null
  const deals = await getDeals(space.id)
  return { count: deals.length, tier: (space.plan ?? 'free').toLowerCase() }
}

/** "N services listed" — publicly listed storefront offerings. Gated on manage access alone (Services is
 *  FREE profile framing, `requiredFunction: null`). Reads the cached preferences blob (no extra query). */
export async function getSpaceServicesSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, null)
  if (!space) return null
  const offerings = readProfileData(space.preferences).offerings ?? []
  return { count: offerings.filter(isServiceListed).length }
}

/** "N campaigns" — the Space's email campaigns. Gated on manage access + the `email` function (and
 *  listSpaceCampaigns self-gates + fails safe to []). Fail-safe. */
export async function getSpaceCampaignsSummary(slug: string): Promise<{ count: number; tier: string } | null> {
  const space = await resolveSummarySpace(slug, 'email')
  if (!space) return null
  const campaigns = await listSpaceCampaigns(space.id)
  return { count: campaigns.length, tier: (space.plan ?? 'free').toLowerCase() }
}

// ── Commerce-service snapshots (modular menu P2 · ADR-545) ───────────────────────────────────────────
// Three CHEAP single-table counts for the independent commerce panels' rail cards, each re-gated on manage
// access + the surface's own per-Space function (resolveSummarySpace) and fail-safe → null → a plain
// link-row. Only the services with a natural, cheap count get a snapshot: Booking (availability windows),
// Memberships (tiers), and Tickets (tiers). Donations (one ask), Enrollment (one program), and Check-in
// (a capture scan) carry no snapshot here — no cheap single-stat, so their panels stay plain link-rows.

/** "N booking windows" — the Space's saved weekly availability windows. Gated on manage access + the
 *  `availability` function. One list read (the SAME the Booking section loads). Fail-safe. */
export async function getSpaceBookingSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'availability')
  if (!space) return null
  const windows = await listSpaceAvailability(space.id)
  return { count: windows.length }
}

/** "N tiers" — the Space's membership tiers. Gated on manage access + the `memberships` function. One list
 *  read (the SAME the Memberships section loads). Fail-safe. */
export async function getSpaceMembershipsSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'memberships')
  if (!space) return null
  const tiers = await listAllMembershipTiers(space.id)
  return { count: tiers.length }
}

/** "N ticket tiers" — the Space's ticket tiers. Gated on manage access + the `tickets` function. One list
 *  read (the SAME the Tickets section loads). Fail-safe. */
export async function getSpaceTicketsSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'tickets')
  if (!space) return null
  const tiers = await listAllTicketTiers(space.id)
  return { count: tiers.length }
}

// ── The Space Hub (ADR-516 Phase B) ──────────────────────────────────────────────────────────────────
// The stats bundle the Space settings/manage Hub rail shows (components/layout/admin-bar/hub-rail.tsx),
// sourced from the SAME summary reads the manage rail already runs + the Space's plan label. RE-GATES on
// manage access (resolveSummarySpace) and returns NULL for a non-manager (fail-safe → the Hub shows only
// the bank). Each function-gated tile (Members/Pipeline) drops to null when the viewer cannot use that
// tool, so the Hub shows only the stats this viewer can source. READ-ONLY.

/** The billing-plan label seam (spaces.plan → a member-facing label). A small map, since there is no
 *  existing Space-tier label helper (the plan feeds gates, not copy). Unknown/absent plan reads "Free". */
const SPACE_PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  practitioner: 'Practitioner',
  business: 'Business',
  organization: 'Organization',
  whitelabel: 'White label',
}

export interface SpaceHubData {
  slug: string
  /** Active members, or null when the viewer cannot use the Members tool (tile dropped). */
  members: number | null
  /** CRM deals in the pipeline, or null when the viewer cannot use the CRM tool (tile dropped). */
  pipeline: number | null
  /** Publicly listed storefront offerings (free profile framing; always available to a manager). */
  services: number | null
  /** Whether the public page is published. */
  published: boolean
  /** The Space plan label (Free / Practitioner / Business / …). */
  planLabel: string
}

/** The Space Hub's stats, or null when the viewer cannot manage this Space (fail-safe). Reuses the cached
 *  Space row + the manage summary getters (React.cache dedupes the Space read across them). */
export async function getSpaceHubData(slug: string): Promise<SpaceHubData | null> {
  const space = await resolveSummarySpace(slug, null)
  if (!space) return null

  const [members, pipeline, services] = await Promise.all([
    getSpaceMembersSummary(slug),
    getSpaceCrmSummary(slug),
    getSpaceServicesSummary(slug),
  ])

  return {
    slug: space.slug,
    members: members?.count ?? null,
    pipeline: pipeline?.count ?? null,
    services: services?.count ?? null,
    published: readWebsitePublished(space.preferences),
    planLabel: SPACE_PLAN_LABEL[(space.plan ?? 'free').toLowerCase()] ?? 'Free',
  }
}
