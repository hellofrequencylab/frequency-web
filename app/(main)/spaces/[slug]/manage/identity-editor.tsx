import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { getSpaceReviews, getSpaceFaqs } from '@/lib/spaces/content-data'
import { normalizeSpaceLocation, type SpaceLocation } from '@/lib/spaces/location'
import type { HeroHeight, HeroButtonOrientation } from '@/lib/spaces/hero-config'
import { SpaceBrandingForm } from '@/components/spaces/space-branding-form'
import { SpaceInfoConnectForm } from '@/components/spaces/space-business-info-form'
import { SpaceSettingsForm } from '@/components/spaces/space-settings-form'
import { SpaceLocationForm } from '@/components/spaces/space-location-form'
import { SpaceFaqEditor } from '@/components/spaces/space-faq-editor'
import { ProfileCompletenessCard } from '../settings/profile-completeness-card'
import { getSpaceRailCore } from './rail-getters'

// THE SPACE IDENTITY EDITOR, in a page (ADR-1336, LIVE-238). The Manage hub's Profile & Settings tab
// renders this above its Team / Reviews / Plan cards, so a Space's settings have ONE door. It used to
// have three: /settings/basics carried its own copy of the identity form beside Info & Connect, the
// location form and the FAQ editor; /manage/settings framed the tab's card index a second time; and
// the tab itself linked back to /settings/basics. Both losing routes now redirect here.
//
// ONE IMPLEMENTATION. The forms below are the SAME components the admin rail stacks inline for the
// `space.basics` module (components/admin/modules/module-map.tsx), fed by the SAME read the rail uses
// (getSpaceRailCore: branding, Info & Connect, visibility, from one gated resolve). The retired page's
// private form (settings/settings-form.tsx) was a second editor over the same columns and is deleted.
// What only that page rendered stays here beside the forms: the completeness meter, the location form
// (ADR-1026) and the FAQ editor. None of those is a manifest field: location is a composite over eight
// columns with a map pin, the FAQ is a table of its own, and the meter is a read.
//
// SECURITY: getSpaceRailCore re-gates (resolveSpaceManageAccess, plus the `profile` per-Space function
// for readOnly) and returns null when the viewer cannot manage, so this renders nothing rather than a
// form it should not show. Every write action re-checks its own gate server-side; readOnly is UX.

/** Read the Space's LOCATION columns (ADR-1026, 20270301000000_space_location.sql).
 *
 *  🔴 Reads the TRUE coordinate, and that is correct HERE and nowhere public. This is the editor:
 *  the owner has to see the pin where they actually put it, or dragging it would be a lie and every
 *  save would walk it further from the truth. The coarsening that `location_precision = 'approximate'`
 *  asks for happens on the READ that PUBLISHES the pin (lib/nearby/map-pins.ts), never on the way
 *  into this form. Fails to an empty location rather than throwing: a settings page must not 500
 *  because one column read went wrong. */
async function readSpaceLocation(spaceId: string): Promise<SpaceLocation> {
  try {
    const { data } = await createAdminClient()
      .from('spaces')
      .select('street, city, region, postal_code, country, latitude, longitude, location_precision')
      .eq('id', spaceId)
      .maybeSingle()
    if (!data) return normalizeSpaceLocation({})
    return normalizeSpaceLocation({
      street: data.street,
      city: data.city,
      region: data.region,
      postalCode: data.postal_code,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      precision: data.location_precision,
    })
  } catch {
    return normalizeSpaceLocation({})
  }
}

export async function SpaceIdentityEditor({ slug }: { slug: string }) {
  const core = await getSpaceRailCore(slug)
  if (!core) return null

  const { basics, branding, settings, hero } = core
  const spaceId = branding.spaceId

  const [reviews, faqs, location] = await Promise.all([
    getSpaceReviews(spaceId),
    getSpaceFaqs(spaceId),
    readSpaceLocation(spaceId),
  ])

  return (
    <section className="space-y-6">
      <SectionHeader title="Profile" />

      {/* The search-readiness meter: identity off the branding slice, story and links off the central
          profile data, and the visible review count off the same read that feeds AggregateRating. */}
      <ProfileCompletenessCard
        input={{
          brandName: branding.brandName || null,
          tagline: branding.tagline || null,
          about: basics.initial.about || basics.business.about,
          logoUrl: branding.brandLogoUrl,
          coverUrl: branding.coverImageUrl,
          offeringsCount: basics.business.offerings?.length ?? 0,
          reviewCount: reviews.count,
          socialCount: basics.business.socials?.length ?? 0,
        }}
      />

      {/* IDENTITY & BRANDING: name, tagline, pictures, the hero look, page theme, accent, header CTA. */}
      <SpaceBrandingForm
        spaceId={spaceId}
        slug={branding.slug}
        brandName={branding.brandName}
        tagline={branding.tagline}
        coverImageUrl={branding.coverImageUrl}
        brandLogoUrl={branding.brandLogoUrl}
        coverScrim={branding.coverScrim}
        logoBackdrop={branding.logoBackdrop}
        coverFocus={branding.coverFocus}
        accent={branding.accent}
        headerCta={branding.headerCta}
        defaultCtaLabel={branding.defaultCtaLabel}
        pageTheme={branding.pageTheme}
        heroHeight={hero?.height as HeroHeight | undefined}
        heroButtonOrientation={hero?.buttonOrientation as HeroButtonOrientation | undefined}
        readOnly={branding.readOnly}
      />

      {/* INFO & CONNECT: About, story, the contact block, price range, category, and social links. */}
      <SpaceInfoConnectForm
        spaceId={spaceId}
        slug={basics.slug}
        about={basics.initial.about}
        business={basics.business}
        readOnly={basics.readOnly}
      />

      {/* WHERE YOU ARE (ADR-1026): the address, the pin, and the exact-or-approximate setting that
          decides what the community map may publish. Identity, so it sits with the contact block. */}
      <SpaceLocationForm slug={branding.slug} initial={location} readOnly={basics.readOnly} />

      {/* COMMON QUESTIONS: the rows the public FAQ block renders and emits as FAQPage JSON-LD. The
          block's empty-state CTA ("Add a question") maps to `space.basics`, which resolves here. */}
      <SpaceFaqEditor slug={branding.slug} initialFaqs={faqs} readOnly={basics.readOnly} />

      {/* VISIBILITY: who can find this space. Autosaves. */}
      <SpaceSettingsForm spaceId={spaceId} slug={settings.slug} visibility={settings.visibility} readOnly={settings.readOnly} />
    </section>
  )
}
