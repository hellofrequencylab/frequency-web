import { notFound } from 'next/navigation'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { EmptyState } from '@/components/ui/empty-state'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { NETWORK_SITE_PLAN } from '@/lib/pricing/plans'
import { listClientSites } from '@/lib/collective/client-sites-store'
import { clientSiteBillLines } from '@/lib/collective/client-sites'
import { canManageClientSites } from '@/lib/collective/client-site-billing'
import { ClientSitesEditor } from './editor'

export const metadata = { title: 'Client websites' }

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`

// ADR-1816: the Network owner's client websites. The owner manages them (billing is the owner's). Platform staff
// can look at any Network's list, read only. Anyone else is told it is owner only, not shown a not-found.
export default async function ClientWebsitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [callerId, space] = await Promise.all([getMyProfileId(), getSpaceBySlug(slug)])
  if (!space || !isNetworkPlan(space.plan)) notFound()
  if (!callerId || callerId !== space.ownerProfileId) {
    if (callerId && (await isPlatformStaff())) {
      const sites = await listClientSites(space.id)
      return (
        <ConsoleFocusTemplate title="Client websites" back={{ href: `/spaces/${slug}/network`, label: 'Network home' }}
          description="You are looking at this Network as Frequency staff. Only its owner can add, hand off or remove websites.">
          {sites.length ? (
            <ul className="divide-y divide-border rounded-card border border-border">
              {sites.map((s) => <li key={s.id} className="px-4 py-3 text-body-sm">{s.name}</li>)}
            </ul>
          ) : <EmptyState variant="first-use" title="No client websites yet" description="This Network has not added any." />}
        </ConsoleFocusTemplate>
      )
    }
    return (
      <ConsoleFocusTemplate title="Client websites" back={{ href: `/spaces/${slug}`, label: 'Back' }}>
        <EmptyState variant="permission" title="Only the owner can manage websites" description="Client websites are added and billed by the owner of this Network. Ask them if you need one." />
      </ConsoleFocusTemplate>
    )
  }
  const [sites, access] = await Promise.all([listClientSites(space.id), canManageClientSites(space.id)])
  const billed = access?.billed !== false
  const lines = clientSiteBillLines(sites.length, sites.filter((s) => s.badgeFree).length)
  const monthly = lines.reduce((sum, l) => sum + l.totalCents, 0)
  const [low, mid, high] = NETWORK_SITE_PLAN.tiers
  return (
    <ConsoleFocusTemplate title="Client websites" back={{ href: `/spaces/${slug}/network`, label: 'Network home' }}
      description={!billed ? 'A website for each of your people, on their own domain. Frequency covers the cost for this Network, so there is no charge. You bill them yourself if you like.' : `A website for each of your people, on their own domain. You pay ${dollars(low.cents)} a site for the first ${low.upTo}, ${dollars(mid.cents)} for ${low.upTo + 1} to ${mid.upTo}, then ${dollars(high.cents)}, domain included. You bill them yourself.`}>
      <ClientSitesEditor networkId={space.id} networkOwnerId={callerId} billed={billed} sites={sites} monthlyLabel={dollars(monthly)} badgeLabel={dollars(NETWORK_SITE_PLAN.badgeRemovalCents)}
        billLines={lines.map((l) => ({ label: l.label, detail: `${l.count} at ${dollars(l.unitCents)}`, total: dollars(l.totalCents) }))} />
    </ConsoleFocusTemplate>
  )
}
