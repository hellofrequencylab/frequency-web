import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { readProfileData } from '@/lib/spaces/profile-data'
import { getSpaceReviews } from '@/lib/spaces/content-data'
import { SpaceSettingsForm, type SpaceSettingsValues } from '../settings-form'
import { ProfileCompletenessCard } from '../profile-completeness-card'

// SPACE BASICS EDITOR — the console's "Basics" section target (ADR-441 EM1-3 hotfix). The unified
// /spaces/<slug>/manage console links its Basics section here. It is a DEDICATED sub-page (NOT the
// /settings index) so it never hits the index's console-type redirect: the index sends every console
// type back to /manage, so pointing Basics at the index made "Open basics" bounce /settings → /manage
// → the console (the loop this surface fixes). The profile FORM was previously only seated on the
// index page; it is lifted here verbatim so each console type opens its real basics editor.
//
// A centered, no-rail Focus surface (registered 'none' implicitly: /spaces/<slug>/settings/* keeps the
// global rail beside its centered Focus body, per page-chrome.ts). It resolves the Space, gates RENDER
// on canManage || staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the
// surface exists), then renders the profile-settings form. The form's WRITE action
// (updateSpaceProfile) stays gated on canEditProfile server-side, so staff viewing is read-only end to
// end. NOINDEX is inherited from the parent settings layout (one robots directive covers every
// sub-page below it). COPY runs CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.
//
// `about` / `tagline` / `visibility` aren't on the mapped Space object (not in the generated DB types
// yet, ADR-246), so they're read here through the untyped admin client, the same pattern the index uses.

type ExtraRow = { about?: string | null; tagline?: string | null; visibility?: string | null }

/** Read the not-yet-typed profile columns (about / tagline / visibility) for a Space id. */
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

export const metadata = {
  title: 'Basics',
}

export default async function SpaceBasicsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else so the surface never confirms it exists. The WRITE action
  // (updateSpaceProfile) stays gated on canEditProfile, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2): the profile FORM is the `profile` function, so
  // it renders read-only when the viewer cannot use it (default editor = the old canEditProfile
  // threshold, so behavior is unchanged unless tuned). A staff janitor keeps the read-only preview.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUseProfile = staffViewing || spaceFunctionAccess(space, 'profile', caps.role)

  const extras = await readProfileExtras(space.id)
  const initial: SpaceSettingsValues = {
    brandName: space.brandName ?? '',
    // brand_accent is a DAWN token name OR a 6-digit hex the owner picked (ADR-516 D2); both paint via
    // resolveAccentVars. A legacy token still round-trips; a custom hex shows in the color picker.
    brandAccent: space.brandAccent ?? '',
    brandLogoUrl: space.brandLogoUrl ?? '',
    coverImageUrl: space.coverImageUrl ?? '',
    about: extras.about ?? '',
    tagline: extras.tagline ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
  }

  const brandName = space.brandName ?? space.name

  // The SEARCH-READINESS inputs for the completeness meter: the identity fields off the Space + the
  // extras read above, the offerings / socials off the central profileData (preferences), and the
  // visible review count off the reviews summary (the same read that feeds the profile's
  // AggregateRating schema). One extra round-trip for the reviews count; everything else is already
  // in hand.
  const profileData = readProfileData(space.preferences)
  const reviews = await getSpaceReviews(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Basics"
      description="Your space's name, brand, about, and who can find it. Changes show up on your space page."
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <ProfileCompletenessCard
        input={{
          brandName: space.brandName,
          tagline: extras.tagline,
          about: extras.about ?? profileData.about,
          logoUrl: space.brandLogoUrl,
          coverUrl: space.coverImageUrl,
          offeringsCount: profileData.offerings?.length ?? 0,
          reviewCount: reviews.count,
          socialCount: profileData.socials?.length ?? 0,
        }}
      />

      <SpaceSettingsForm
        spaceId={space.id}
        slug={space.slug}
        initial={initial}
        readOnly={staffViewing || !canUseProfile}
      />
    </FocusTemplate>
  )
}
