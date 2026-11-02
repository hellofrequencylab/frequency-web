import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { SpotlightPageEditor } from '@/components/spotlight/spotlight-page-editor'
import { SPOTLIGHT_SELECT, type SpotlightRow } from '@/lib/spotlight/privacy'
import { readSpotlightEnabled, readSpotlightPublished, readSpotlightLayoutRaw } from '@/lib/profile/spotlight-flags'
import { validateSpotlightLayout } from '@/lib/spotlight/blocks/validate'
import { readPageSettings, validatePageSettings, type PageLink } from '@/lib/spotlight/link-in-bio'
import { readMemberLinkClicks } from '@/lib/spotlight/link-clicks'
import { allowanceAt } from '@/lib/pricing/feature-meters'
import type { EntitlementTier } from '@/lib/core/entitlement'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Edit your Spotlight', robots: { index: false } }

// EDIT YOUR SPOTLIGHT (personal). One page for the link-in-bio: ordered links, a social row, the "Show Frequency
// features" switch and a live preview of the real public render. Owner-only and session-derived. A member who has
// never saved here starts from the links they already had in their older Spotlight, so nothing is lost.
export default async function EditSpotlightPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) notFound()
  const own = me as { id: string; handle: string | null; meta?: unknown; membership_tier?: string | null }
  if (!own.handle) redirect('/settings/profile')

  const { data: row } = await supabase.from('profiles').select(SPOTLIGHT_SELECT).eq('id', own.id).maybeSingle()
  if (!row) notFound()

  let settings = readPageSettings(own.meta)
  if (!settings.configured) {
    const legacy = validateSpotlightLayout(readSpotlightLayoutRaw(own.meta), user.id)
    const links: PageLink[] = legacy.blocks
      .flatMap((b) => (b.type === 'links' ? b.items : []))
      .map((l, i) => ({ id: `legacy${i}`, title: l.label, url: l.url, icon: 'link', hidden: false, highlight: false }))
    settings = { ...validatePageSettings({ links }), configured: false }
  }

  const clicks = await readMemberLinkClicks(own.id)
  const tier = (own.membership_tier ?? 'free') as EntitlementTier
  const maxLinks = allowanceAt('spotlight_blocks', tier)

  return (
    <FocusTemplate
      width="xl"
      title="Edit your Spotlight"
      description="Your links, in the order you want them. Save, and your page updates."
      back={{ href: `/people/${own.handle}`, label: 'Your profile' }}
    >
      <SpotlightPageEditor
        profile={row as unknown as SpotlightRow}
        initial={settings}
        maxLinks={typeof maxLinks === 'number' ? maxLinks : null}
        enabled={readSpotlightEnabled(own.meta)}
        published={readSpotlightPublished(own.meta)}
        clicks={clicks}
      />
    </FocusTemplate>
  )
}
