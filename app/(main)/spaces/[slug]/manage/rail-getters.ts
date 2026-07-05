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
  spaceAutonomyLevel,
  type AutonomyLevel,
} from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { getDeals, getStages, type StageKind } from '@/lib/crm/pipeline'
import { resolveStageManagerAccess } from '@/lib/crm/stages'
import { listSpaceCampaigns } from '@/lib/spaces/campaigns'
import {
  readProfilePages,
  hasPage,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { readCoverScrim } from './layout/preferences'
import { enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { partitionSpaceBlocks } from '@/lib/entity-blocks/space-blocks'
import { parseEntityLayout, resolveRows, type RowDef } from '@/lib/entity-blocks/layout'
import { readProfileData, isServiceListed, type SpaceProfileData } from '@/lib/spaces/profile-data'
import { readWebsitePublished } from '@/lib/spaces/website'
import type { SpaceSettingsValues } from '../settings/settings-form'

// ── Basics (space.basics) ──────────────────────────────────────────────────────────────────────────
// The SpaceSettingsForm prop bundle the /settings/basics page assembles (basics/page.tsx). Read-gated on
// manage access; the form's own updateSpaceProfile re-checks canEditProfile, so readOnly is UX.

interface SpaceBasicsData {
  spaceId: string
  slug: string
  initial: SpaceSettingsValues
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

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUseProfile = staffViewing || spaceFunctionAccess(space, 'profile', caps.role)

  const extras = await readProfileExtras(space.id)
  const initial: SpaceSettingsValues = {
    brandName: space.brandName ?? '',
    brandAccent: space.brandAccent ?? '',
    brandLogoUrl: space.brandLogoUrl ?? '',
    coverImageUrl: space.coverImageUrl ?? '',
    about: extras.about ?? '',
    tagline: extras.tagline ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
  }

  return {
    spaceId: space.id,
    slug: space.slug,
    initial,
    readOnly: staffViewing || !canUseProfile,
  }
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
  if (!isConsoleSpaceType(space.type)) return null

  const coverScrim = readCoverScrim(space.preferences)

  const pages = readProfilePages(space.preferences)
  const requested = (pageSlug ?? HOME_SLUG).trim().toLowerCase()
  const activePageSlug = hasPage(space.preferences, requested) ? requested : HOME_SLUG

  return {
    slug,
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
  /** Space blocks locked behind a function this space does not have on — held out of the picker + bench. */
  lockedIds: string[]
}

/** The Space's own resolved profile-page layout for the builder, or null when the viewer cannot manage
 *  this Space (fail-safe → the builder renders nothing). */
export async function getSpaceLayoutRailData(slug: string): Promise<SpaceLayoutRailData | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) return null

  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const saved = parseEntityLayout(rawLayout)
  const { lockedIds } = partitionSpaceBlocks(enabledFunctionKeys(space))

  return {
    slug: space.slug,
    rows: resolveRows(saved, 'space'),
    hidden: saved?.hidden ?? [],
    customized: !!(saved && (saved.rows?.length || saved.template || saved.slots || saved.order)),
    lockedIds,
  }
}

// NOTE: Space Mode is a creation-time PRESET (framing/labels/pipeline seed) and is edited on the full
// `/spaces/<slug>/manage/mode` page reachable from the manage console. The rail no longer surfaces it: the
// former inline `SpaceModeModule` and the "Starter" chip (getSpaceStarterChip) were removed (ADR-527) once
// universal functions + the freeform layout editor made Mode purely a starting preset, not a rail control.

// ── Vera autonomy (space.autonomy) ───────────────────────────────────────────────────────────────────
// The inline rail control for the per-Space Vera autonomy dial (Resonance Engine Phase 3 · ADR-384;
// rail control ADR-517 Phase F GAP 2). Reuses the existing setSpaceAutonomy write; this getter only
// READS the current level and re-gates the SAME owner/admin authority the setter enforces
// (caps.canManageMembers). Returns null for anyone who cannot change it (including a staff previewer, who
// gets no write), so the inline module renders nothing — the write authority is never widened.

interface SpaceAutonomyData {
  slug: string
  level: AutonomyLevel
}

/** The Vera autonomy control's data, or null when the viewer cannot manage this Space's members
 *  (owner/admin only, matching setSpaceAutonomy). Fail-safe -> the inline module renders nothing. */
export async function getSpaceAutonomyData(slug: string): Promise<SpaceAutonomyData | null> {
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

  // Owner / admin only (the SAME gate setSpaceAutonomy re-checks). A mere editor or a staff previewer
  // cannot change autonomy, so they get no control.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canManageMembers) return null

  return { slug: space.slug, level: spaceAutonomyLevel(space) }
}

// ── Pipeline (space.pipeline) ────────────────────────────────────────────────────────────────────────
// The compact stage list for the inline rail Pipeline module (ADR-517 Phase F2 · audit GAP 1: "the on
// screen pipeline gets an admin function in the bar"). Re-gates EXACTLY like the stage write actions
// (lib/crm/stages.ts requireStageManager): manage access (canManage; a staff previewer is not canManage,
// so gets nothing) PLUS the `crm` function. Returns null for anyone who cannot edit the pipeline, so the
// inline module renders nothing — the editor authority is never widened. READ-ONLY + serializable.

interface SpacePipelineData {
  slug: string
  /** The Space's stages, in order (id + name + kind), for the compact rail preview. */
  stages: { id: string; name: string; kind: StageKind }[]
}

/** The rail Pipeline module's data, or null when the viewer cannot edit this Space's pipeline. Re-gates
 *  through the EXACT same seam the stage writes use (resolveStageManagerAccess: manage access + the crm
 *  function; a staff previewer / non-manager gets null), so the inline module never widens the editor
 *  authority. Fail-safe -> the module renders nothing. */
export async function getSpacePipelineData(slug: string): Promise<SpacePipelineData | null> {
  const access = await resolveStageManagerAccess(slug)
  if (!access) return null

  const stages = await getStages(access.spaceId)
  return { slug: access.slug, stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind })) }
}

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
