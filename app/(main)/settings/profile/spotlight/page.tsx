import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FocusTemplate } from '@/components/templates'
import {
  readSpotlightEnabled,
  readSpotlightLayoutRaw,
  readSpotlightBackgroundRaw,
  readSpotlightThemeRaw,
} from '@/lib/profile/spotlight-flags'
import {
  validateSpotlightLayout,
  validateSpotlightBackground,
} from '@/lib/spotlight/blocks/validate'
import { validateSpotlightTheme } from '@/lib/spotlight/theme'
import { LayoutEditor } from '@/components/spotlight/layout-editor'
import { SpotlightThemeEditor } from '@/components/spotlight/theme-editor'

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
  const theme = validateSpotlightTheme(readSpotlightThemeRaw(meta))

  return (
    <FocusTemplate
      title="Build your Spotlight"
      description="Theme your colours and fonts, add blocks, and arrange them however you like. Save, then publish from your profile settings."
      back={{ href: '/settings/profile', label: 'Profile settings' }}
    >
      <div className="space-y-6">
        <SpotlightThemeEditor initial={theme} />
        <LayoutEditor initial={layout} initialBackground={background} handle={handle} />
      </div>
    </FocusTemplate>
  )
}
