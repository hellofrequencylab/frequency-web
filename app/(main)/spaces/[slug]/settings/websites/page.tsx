import { notFound } from 'next/navigation'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { NETWORK_SITE_PLAN } from '@/lib/pricing/plans'
import { listClientSites } from '@/lib/collective/client-sites-store'
import { clientSiteBillLines } from '@/lib/collective/client-sites'
import { ClientSitesEditor } from './editor'

export const metadata = { title: 'Client websites' }

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`

// ADR-1816: the Network owner's client websites. Only the owner of a Network sees it (billing is the owner's),
// everyone else finds nothing here.
export default async function ClientWebsitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [callerId, space] = await Promise.all([getMyProfileId(), getSpaceBySlug(slug)])
  if (!space || !callerId || callerId !== space.ownerProfileId || !isNetworkPlan(space.plan)) notFound()
  const sites = await listClientSites(space.id)
  const lines = clientSiteBillLines(sites.length, sites.filter((s) => s.badgeFree).length)
  const monthly = lines.reduce((sum, l) => sum + l.totalCents, 0)
  const [low, mid, high] = NETWORK_SITE_PLAN.tiers
  return (
    <ConsoleFocusTemplate title="Client websites" back={{ href: `/spaces/${slug}/network`, label: 'Network home' }}
      description={`A website for each of your people, on their own domain. You pay ${dollars(low.cents)} a site for the first ${low.upTo}, ${dollars(mid.cents)} for ${low.upTo + 1} to ${mid.upTo}, then ${dollars(high.cents)}, domain included. You bill them yourself.`}>
      <ClientSitesEditor networkId={space.id} networkOwnerId={callerId} sites={sites} monthlyLabel={dollars(monthly)} badgeLabel={dollars(NETWORK_SITE_PLAN.badgeRemovalCents)}
        billLines={lines.map((l) => ({ label: l.label, detail: `${l.count} at ${dollars(l.unitCents)}`, total: dollars(l.totalCents) }))} />
    </ConsoleFocusTemplate>
  )
}
