import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, CalendarClock, ChevronRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { SpaceSettingsForm, type SpaceSettingsValues } from './settings-form'

// OWNER SETTINGS — the Focus edit surface (ENTITY-SPACES-BUILD Wave B, Epic 1.7). A centered,
// no-rail form (the rail is registered 'none' for /spaces/<slug>/settings in page-chrome.ts). It
// resolves the Space, gates on canEditProfile (404s otherwise so a non-editor can't tell the
// settings surface exists), and renders the edit form seeded with the Space's current copy.
//
// `about` / `tagline` / `visibility` aren't on the mapped Space object (they aren't in the generated
// DB types yet, ADR-246), so they're read here through the untyped admin client alongside the
// resolved Space, the same pattern lib/spaces/store.ts uses for `visibility`.

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
  title: 'Space settings',
}

export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate: only an editor+ (owner / admin / editor) may open settings. 404 (not 403) so the surface
  // never confirms it exists to someone who can't edit.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const extras = await readProfileExtras(space.id)
  const initial: SpaceSettingsValues = {
    brandName: space.brandName ?? '',
    // brand_accent is stored as a DAWN token name; an old hex value (pre-Wave-B) simply won't match
    // a picker option and reads as "None" until re-picked.
    brandAccent: space.brandAccent ?? '',
    brandLogoUrl: space.brandLogoUrl ?? '',
    about: extras.about ?? '',
    tagline: extras.tagline ?? '',
    visibility: extras.visibility === 'private' ? 'private' : 'network',
  }

  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Space settings"
      description="Edit your profile, brand, and visibility. Changes show on your space right away."
      back={{ href: `/spaces/${space.slug}`, label: brandName }}
    >
      <SpaceSettingsForm spaceId={space.id} slug={space.slug} initial={initial} />

      {space.type === 'practitioner' && (
        // The Practitioner's 1:1 booking lives on its own Focus surface (weekly availability + the
        // owner's upcoming bookings). Link to it from settings rather than nesting another editor.
        <Link
          href={`/spaces/${space.slug}/settings/availability`}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">Availability and bookings</span>
            <span className="block text-xs text-muted">
              Set the weekly times members can book, and see who is on your calendar.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        </Link>
      )}

      {space.type === 'business' && (
        // The Business's memberships live on their own Focus surface (the tier editor + the member
        // list). Link to it from settings rather than nesting another editor.
        <Link
          href={`/spaces/${space.slug}/settings/memberships`}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <BadgeCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">Memberships</span>
            <span className="block text-xs text-muted">
              Define the tiers members can join, and see who has joined.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        </Link>
      )}
    </FocusTemplate>
  )
}
