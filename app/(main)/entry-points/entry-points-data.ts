import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { listMyEntryPoints } from '@/lib/entry-points/store'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import { crewEntryTemplates } from '@/lib/entry-points/template-settings'
import type { EntryCard } from './entry-points-client'

// The reads behind the Entry points page, shared by the member route (/entry-points) and the operator
// console's door to it (/admin/entry-points), so the two pages only differ in the shell around them.
export async function loadEntryPoints(profileId: string) {
  const [entries, targets, templates] = await Promise.all([
    listMyEntryPoints(profileId),
    listMarketingTargets(profileId),
    crewEntryTemplates(),
  ])

  // Signups credited to this member (owner-credit on signup, ADR-091/126).
  const admin = createAdminClient()
  const { count: signups } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_profile_id', profileId)

  // Pre-render each QR (server) so the list paints instantly.
  const cards: EntryCard[] = entries.map((e) => ({
    id: e.id,
    slug: e.slug,
    url: shortLinkUrl(e.slug),
    title: e.title,
    destination: e.destination,
    templateId: e.templateId,
    scans: e.scans,
    qrSvg: renderStyledQrSvg(shortLinkUrl(e.slug), e.style, 200),
  }))

  return {
    cards,
    templates,
    destinationGroups: entryDestinationGroups(targets),
    totalScans: entries.reduce((sum, e) => sum + e.scans, 0),
    signups: signups ?? 0,
  }
}
