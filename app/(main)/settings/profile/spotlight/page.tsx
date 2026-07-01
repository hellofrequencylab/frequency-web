import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  readSpotlightThemes,
  resolveSpotlightEditorSeed,
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
  // Load DRAFT-ELSE-LIVE: resume the member's working draft when one exists (so reopening the
  // editor keeps their unpublished edits), otherwise seed from the last-published live nodes. The
  // public page still reads ONLY the live nodes, so a draft never leaks. Each part is VALIDATED on
  // read (the same boundary the public renderer enforces), then bridged into Puck by the converter.
  const seed = resolveSpotlightEditorSeed(meta)
  const layout = validateSpotlightLayout(seed.layout, user.id)
  const background = validateSpotlightBackground(seed.background, user.id)
  const theme = validateSpotlightTheme(seed.theme)
  const published = readSpotlightPublished(meta)
  // The member's saved theme slots (validated on read), for the "My themes" switcher.
  const themeSlots = readSpotlightThemes(meta, user.id)

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
      initialThemeSlots={themeSlots}
      initialTopFriends={topFriends}
      friendChoices={friendChoices}
      hasUnpublishedChanges={seed.hasUnpublishedChanges}
    />
  )
}
