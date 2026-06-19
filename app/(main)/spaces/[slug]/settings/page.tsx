import { notFound } from 'next/navigation'
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
    </FocusTemplate>
  )
}
