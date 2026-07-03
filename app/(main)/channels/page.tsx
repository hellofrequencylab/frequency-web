import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewChannelCompose } from './new-channel-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageModules } from '@/components/widgets/page-modules'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'

// Channels (ADR-270/294). The whole pillar-grouped browse is module-driven: the toc, the four
// Pillars with their Channels (split tuned-in vs explore), and the Pillars jump-nav are one layout
// module (channels-list) the operator can arrange (Settings ▾ → Page → Layout). This page keeps
// only the IndexTemplate header + the create/CTA action, then renders <PageModules>.

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Channels',
  description:
    'The four Pillars (Mind, Body, Spirit, and Expression) are how Frequency is organized. Channels live inside them: global topics anyone can tune into, each carrying a practice that Circles run locally. Pick a Pillar, find your Channel, then go do it with people near you.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/channels', CONTENT_FALLBACK)
}

export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title: pageTitle, description: pageDescription, ctaLabel, ctaHref } =
    await resolvePageContent('/channels', CONTENT_FALLBACK)

  const { data: { user } } = await supabase.auth.getUser()

  let canCreate = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('community_role').eq('auth_user_id', user.id).maybeSingle()
    const role = (profile as { community_role?: string } | null)?.community_role
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
  }

  // The create dialog needs the Pillar options (id + name) to sort a new Channel into a Pillar.
  const { data: pillarsData } = await admin
    .from('pillars').select('id, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  const pillars = (pillarsData ?? []) as { id: string; name: string }[]

  return (
    <IndexTemplate
      title={pageTitle}
      description={
        <>
          {/* Mobile leads with a tight line so the Channels surface without scrolling
              past a wall of copy; desktop keeps the operator-editable full explainer. */}
          <span className="sm:hidden">Four Pillars (Mind, Body, Spirit, Expression) and the Channels inside them.</span>
          <span className="hidden sm:inline">{pageDescription}</span>
        </>
      }
      action={
        (canCreate || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {canCreate && <NewChannelCompose pillars={pillars} />}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
    >
      {/* The whole pillar-grouped browse is module-driven and arranged by the operator. The block
          self-fetches (viewer-scoped) and renders the toc, the Pillars, and the jump-nav. */}
      <PageModules route="/channels" />
    </IndexTemplate>
  )
}
