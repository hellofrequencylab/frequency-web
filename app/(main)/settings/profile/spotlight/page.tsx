import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FocusTemplate } from '@/components/templates'
import {
  readSpotlightEnabled,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
} from '@/lib/profile/spotlight-flags'
import {
  validateSpotlightLayout,
  validateSpotlightBackground,
} from '@/lib/spotlight/blocks/validate'
import { LayoutEditor } from '@/components/spotlight/layout-editor'

export const dynamic = 'force-dynamic'

// The Spotlight page builder. Owner-only (session-derived) and only once an admin has
// turned the member's Spotlight on — otherwise it sends them back to Settings.
export default async function SpotlightEditorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) notFound()

  const meta = (me as { meta?: unknown }).meta
  if (!readSpotlightEnabled(meta)) redirect('/settings/profile')

  const handle = ((me as { handle?: string }).handle) ?? ''
  const layout = validateSpotlightLayout(readSpotlightLayoutRaw(meta), user.id)
  const background = validateSpotlightBackground(readSpotlightBackgroundRaw(meta), user.id)

  return (
    <FocusTemplate
      title="Build your Spotlight"
      description="Add headings, text, links, images, and a background, and arrange them however you like. Save, then publish from your profile settings."
      back={{ href: '/settings/profile', label: 'Profile settings' }}
    >
      <LayoutEditor initial={layout} initialBackground={background} handle={handle} />
    </FocusTemplate>
  )
}
