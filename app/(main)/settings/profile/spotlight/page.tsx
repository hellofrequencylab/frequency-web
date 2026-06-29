import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FocusTemplate } from '@/components/templates'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
  readSpotlightThemeRaw,
} from '@/lib/profile/spotlight-flags'
import {
  validateSpotlightLayout,
  validateSpotlightBackground,
} from '@/lib/spotlight/blocks/validate'
import { validateSpotlightTheme } from '@/lib/spotlight/theme'
import type { SpotlightRow } from '@/lib/spotlight/privacy'
import type { SpotlightHostedEvent } from '@/lib/spotlight/data'
import { getProfileZapTotal } from '@/lib/profile-zaps'
import { getTopFriendsForOwner, getAcceptedFriendsForPicker } from '@/lib/spotlight/top-friends'
import { SpotlightBuilder } from '@/components/spotlight/builder'

export const dynamic = 'force-dynamic'

// The Spotlight page builder. Owner-only (session-derived) and only once the member's
// Spotlight is enabled — otherwise it sends them back to Settings. Renders the split-screen
// builder: controls on the left, a live preview of the real page on the right.
export default async function SpotlightEditorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  // The preview reuses the public SpotlightView, so we read the same allowlisted, member-safe
  // identity fields it shows (never contact/geo). Read via the untyped client for the columns
  // not yet in the generated types (header_image_url).
  const { data: me } = await (admin)
    .from('profiles')
    .select(`
      id, handle, display_name, avatar_url, header_image_url, bio, website,
      community_role, membership_tier, created_at, current_streak, lifetime_gems,
      profile_theme, is_active, is_system, meta,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) notFound()

  const row = me as Record<string, unknown>
  const meta = row.meta
  if (!readSpotlightEnabled(meta)) redirect('/settings/profile')

  const handle = (row.handle as string | null) ?? ''
  const layout = validateSpotlightLayout(readSpotlightLayoutRaw(meta), user.id)
  const background = validateSpotlightBackground(readSpotlightBackgroundRaw(meta), user.id)
  const theme = validateSpotlightTheme(readSpotlightThemeRaw(meta))
  const published = readSpotlightPublished(meta)

  // Upcoming events this member hosts — shown in the preview's curated default (no layout).
  const { data: events } = await admin
    .from('events')
    .select('id, slug, title, starts_at')
    .eq('host_id', row.id as string)
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(5)

  const totalZaps = await getProfileZapTotal(row.id as string)

  // Top Friends: the member's current ordered grid + every friend they can pick from.
  const [topFriends, friendChoices] = await Promise.all([
    getTopFriendsForOwner(row.id as string),
    getAcceptedFriendsForPicker(row.id as string),
  ])

  // The member-safe identity the preview renders (mirrors lib/spotlight/privacy.ts).
  const profile: SpotlightRow = {
    id: row.id as string,
    handle: row.handle as string,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    header_image_url: (row.header_image_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    community_role: (row.community_role as string | null) ?? null,
    membership_tier: (row.membership_tier as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    current_streak: (row.current_streak as number | null) ?? null,
    lifetime_gems: (row.lifetime_gems as number | null) ?? null,
    profile_theme: (row.profile_theme as string | null) ?? null,
    is_active: (row.is_active as boolean | null) ?? null,
    is_system: (row.is_system as boolean | null) ?? null,
    nexus_regions: (row.nexus_regions as { name: string | null } | null) ?? null,
  }

  return (
    <FocusTemplate
      title="Build your Spotlight"
      description="Theme your colours and fonts, add blocks, and watch the preview update live. Publish to take it live."
      back={{ href: '/settings/profile', label: 'Profile settings' }}
      width="wide"
    >
      <SpotlightBuilder
        handle={handle}
        published={published}
        profile={profile}
        hostedEvents={(events ?? []) as SpotlightHostedEvent[]}
        totalZaps={totalZaps}
        initialTheme={theme}
        initialLayout={layout}
        initialBackground={background}
        initialTopFriends={topFriends}
        friendChoices={friendChoices}
      />
    </FocusTemplate>
  )
}
