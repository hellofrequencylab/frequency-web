import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
  readSpotlightThemeRaw,
} from '@/lib/profile/spotlight-flags'
import { validateSpotlightLayout, validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import { validateSpotlightTheme } from '@/lib/spotlight/theme'
import { getTopFriendsForOwner, getAcceptedFriendsForPicker } from '@/lib/spotlight/top-friends'
import { SpotlightPuckEditor } from '@/components/spotlight/puck-editor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

// The Spotlight page builder, now RUNNING ON THE SHARED <Puck> ENGINE (Phase 3). Owner-only
// (session-derived) and only once the member's Spotlight is enabled — otherwise it sends
// them back to Settings. Full-screen Puck for the block body (the same block library + editor
// a brand Space uses); the theme, background, and Top Friends picker live in the Theme drawer.
export default async function SpotlightEditorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) notFound()

  const row = me as { id: string; handle: string | null; meta: unknown }
  const meta = row.meta
  if (!readSpotlightEnabled(meta)) redirect('/settings/profile')

  const handle = row.handle ?? ''
  // Validate on read (the same boundary the public renderer enforces), then bridge into Puck
  // inside the editor via the pure converter — a migration-free load of the stored layout.
  const layout = validateSpotlightLayout(readSpotlightLayoutRaw(meta), user.id)
  const background = validateSpotlightBackground(readSpotlightBackgroundRaw(meta), user.id)
  const theme = validateSpotlightTheme(readSpotlightThemeRaw(meta))
  const published = readSpotlightPublished(meta)

  const [topFriends, friendChoices] = await Promise.all([
    getTopFriendsForOwner(row.id),
    getAcceptedFriendsForPicker(row.id),
  ])

  return (
    <SpotlightPuckEditor
      handle={handle}
      published={published}
      initialLayout={layout}
      initialTheme={theme}
      initialBackground={background}
      initialTopFriends={topFriends}
      friendChoices={friendChoices}
    />
  )
}
