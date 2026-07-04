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
import { spaceFunctionAccess, spaceFunctionDef, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { getDeals } from '@/lib/crm/pipeline'
import { listSpaceCampaigns } from '@/lib/spaces/campaigns'
import {
  readProfilePages,
  hasPage,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { readCoverSize, readCoverScrim, readProfileTemplate } from './layout/preferences'
import { enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { partitionSpaceBlocks } from '@/lib/entity-blocks/space-blocks'
import { parseEntityLayout, resolveRows, type RowDef } from '@/lib/entity-blocks/layout'
import type { TemplateId } from '@/lib/widgets/templates'
import { readProfileData, isServiceListed, type SpaceProfileData } from '@/lib/spaces/profile-data'
import { readWebsitePublished } from '@/lib/spaces/website'
import {
  resolveMode,
  listVariantsForType,
  modeHasFocusChoice,
  readModePreferences,
  effectiveNavEmphasis,
  effectiveLabel,
} from '@/lib/spaces/modes'
import type { SpaceSettingsValues } from '../settings/settings-form'
import type { FocusChoiceLike } from '@/components/spaces/space-page-panel'
import type { ModeView, FocusChoice, ModuleRow } from './mode/mode-settings'

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
  coverSize: ReturnType<typeof readCoverSize>
  coverScrim: ReturnType<typeof readCoverScrim>
  accent: string
  profileTemplate: TemplateId
  businessInfo: SpaceProfileData
  coverImageUrl: string | null
  brandLogoUrl: string | null
  websitePublished: boolean
  canManagePages: boolean
  focus: { choices: FocusChoiceLike[] } | null
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

  const coverSize = readCoverSize(space.preferences)
  const coverScrim = readCoverScrim(space.preferences)

  const pages = readProfilePages(space.preferences)
  const requested = (pageSlug ?? HOME_SLUG).trim().toLowerCase()
  const activePageSlug = hasPage(space.preferences, requested) ? requested : HOME_SLUG

  const mode = resolveMode(space.type, space.modeVariant)
  const focusChoices: FocusChoiceLike[] =
    mode && modeHasFocusChoice(space.type)
      ? listVariantsForType(space.type).map((m) => ({
          variant: m.variant,
          label: m.focusLabel,
          tagline: m.tagline,
          active: m.variant === mode.variant,
        }))
      : []

  return {
    slug,
    pages,
    activePageSlug,
    maxPages: MAX_PROFILE_PAGES,
    coverSize,
    coverScrim,
    accent: space.brandAccent ?? '',
    profileTemplate: readProfileTemplate(space.preferences),
    businessInfo: readProfileData(space.preferences),
    coverImageUrl: space.coverImageUrl ?? null,
    brandLogoUrl: space.brandLogoUrl ?? null,
    websitePublished: readWebsitePublished(space.preferences),
    canManagePages: spaceCanUseFullWebsite(space),
    focus: focusChoices.length > 0 ? { choices: focusChoices } : null,
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

// ── Mode and focus (space.mode) ────────────────────────────────────────────────────────────────────
// The ModeSettings view model the /manage/mode page assembles (manage/mode/page.tsx). Read-gated on
// manage access; every write re-gates the owner/admin role in its own action, so readOnly is UX.

interface SpaceModeData {
  slug: string
  view: ModeView
  readOnly: boolean
}

/** The Mode editor's data, or null when the viewer cannot manage this Space / the type has no Mode
 *  (fail-safe). Re-gates exactly like manage/mode/page.tsx. */
export async function getSpaceModeData(slug: string): Promise<SpaceModeData | null> {
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

  const mode = resolveMode(space.type, space.modeVariant)
  if (!mode) return null
  const prefs = readModePreferences(space.preferences)

  const focusChoices: FocusChoice[] = modeHasFocusChoice(space.type)
    ? listVariantsForType(space.type).map((m) => ({
        variant: m.variant,
        label: m.focusLabel,
        tagline: m.tagline,
        active: m.variant === mode.variant,
      }))
    : []

  const emphasis = effectiveNavEmphasis(mode, prefs)
  const modules: ModuleRow[] = emphasis.map((fn) => {
    const def = spaceFunctionDef(fn)
    const override = effectiveLabel(prefs, fn)
    return {
      fn,
      label: override ?? def?.label ?? fn,
      defaultLabel: def?.label ?? fn,
      overridden: override !== null,
      suggestedOn: (prefs.toggles?.[fn] ?? mode.defaultToggles.includes(fn)) === true,
    }
  })

  const view: ModeView = {
    modeLabel: mode.modeLabel,
    focusLabel: mode.focusLabel,
    tagline: mode.tagline,
    pipeline: mode.pipeline.map((s) => ({ name: s.name, kind: s.kind })),
    lexicon: mode.lexicon,
    recommendedAddons: mode.recommendedAddons.map((k) => k),
    nextBestActions: mode.nextBestActions.map((a) => ({ label: a.label })),
    modules,
    focusChoices,
    hasOverrides: Object.keys(prefs).length > 0,
  }

  return { slug, view, readOnly: staffViewing && !canManage }
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

/** The compact identity strip's data (cover + logo + name), or null when the viewer cannot manage this
 *  Space (fail-safe → the strip renders nothing). All fields already ride the cached Space row. */
export async function getSpaceIdentityData(
  slug: string,
): Promise<{ slug: string; name: string; coverImageUrl: string | null; brandLogoUrl: string | null } | null> {
  const space = await resolveSummarySpace(slug, null)
  if (!space) return null
  return {
    slug: space.slug,
    name: (space.brandName ?? '').trim() || space.name,
    coverImageUrl: space.coverImageUrl ?? null,
    brandLogoUrl: space.brandLogoUrl ?? null,
  }
}

/** "N members" — active memberships only. Gated on manage access + the `members` function. Fail-safe. */
export async function getSpaceMembersSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'members')
  if (!space) return null
  const members = await listSpaceMembers(space.id)
  return { count: members.filter((m) => m.status === 'active').length }
}

/** "N in your pipeline" — the Space's CRM deals. Gated on manage access + the `crm` function. The lean
 *  read (getDeals, one query) over the 4-read funnel. Fail-safe. */
export async function getSpaceCrmSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'crm')
  if (!space) return null
  const deals = await getDeals(space.id)
  return { count: deals.length }
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
export async function getSpaceCampaignsSummary(slug: string): Promise<{ count: number } | null> {
  const space = await resolveSummarySpace(slug, 'email')
  if (!space) return null
  const campaigns = await listSpaceCampaigns(space.id)
  return { count: campaigns.length }
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
