'use server'

// CLIENT-CALLABLE READ GETTER for the personal "You" inline surfaces of the standardized admin rail
// (ADR-514 Phase D; ADR-515 Phase 2). The bar renders a signed-in viewer's OWN Profile / Spotlight / Layout
// INLINE, but those editors were built as SERVER-fed /settings/* pages. This getter lets the client bar's
// thin wrapper modules self-fetch exactly the prop bundle the /settings/profile page assembles, mirroring
// the Space rail-getters (app/(main)/spaces/[slug]/manage/rail-getters.ts):
//   • it RE-GATES server-side on the AUTHED viewer (the viewer edits their own account) and returns NULL
//     when signed out — so the wrapper renders nothing (fail-safe: a flattened bar never weakens a gate);
//   • it returns only SERIALIZABLE data (plain values across the RSC boundary; no React, no Icons);
//   • it is READ-ONLY — no write action changes. The form's own action (updateProfile / setMySpotlight*)
//     already re-checks auth server-side, so this is convenience over an unchanged authority.
//
// ADR-515 Phase 2 moved Appearance, Notifications, and Connections and location OUT of the sidebar into the
// bottom bank (they link to their /settings/* page via lib/admin/entity-surface-hrefs.ts), so their inline
// wrappers + the getNotificationsRailData / getConnectionsRailData getters were retired. Only the Profile
// bundle remains — it feeds the inline Profile form, the condensed Spotlight section (the spotlight flags),
// and the Layout link (the handle).

import { createClient } from '@/lib/supabase/server'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import { readSpotlightEnabled, readSpotlightPublished } from '@/lib/profile/spotlight-flags'

// ── Profile (account.profile / account.spotlight / account.layout) ─────────────────────────────────────
// The ProfileForm prop bundle the /settings/profile page assembles (profile/page.tsx). Re-gated on the
// authed user; the form's own updateProfile re-checks auth + ownership, so this is UX convenience.

interface ProfileRailData {
  userId: string
  initial: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string
    headerImageUrl: string
    email: string
    phone: string
    city: string
    website: string
    spotlightEnabled: boolean
    spotlightPublished: boolean
    canEnableSpotlight: boolean
    profileTheme: string | null
  }
}

/** The Profile editor's data, or null when signed out / the profile is missing (fail-safe → the wrapper
 *  renders nothing). Mirrors profile/page.tsx's fetch (the core ProfileForm bundle only — the QR card,
 *  onboarding welcome, and location card stay on the full page). */
export async function getProfileRailData(): Promise<ProfileRailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, bio, avatar_url, phone, city, website, meta, profile_theme')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const spotlightEnabled = readSpotlightEnabled((profile as { meta?: unknown }).meta)
  const spotlightPublished = readSpotlightPublished((profile as { meta?: unknown }).meta)
  const canEnableSpotlight = (await getProfileCapabilities(profile.id as string)).has('spotlight.enable')

  // header_image_url isn't in the generated types yet (new column) — read via cast, like the page.
  const { data: hdr } = await supabase
    .from('profiles')
    .select('header_image_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const headerImageUrl = (hdr as { header_image_url?: string | null } | null)?.header_image_url ?? ''

  return {
    userId: user.id,
    initial: {
      displayName: profile.display_name ?? '',
      handle: profile.handle ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatar_url ?? '',
      headerImageUrl,
      email: user.email ?? '',
      phone: profile.phone ?? '',
      city: profile.city ?? '',
      website: profile.website ?? '',
      spotlightEnabled,
      spotlightPublished,
      canEnableSpotlight,
      profileTheme: (profile as { profile_theme?: string | null }).profile_theme ?? null,
    },
  }
}
