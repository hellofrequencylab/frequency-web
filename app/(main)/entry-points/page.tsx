// "My Entry Points" — every member's outreach portal (ADR-126, docs/ENTRY-POINTS.md).
// The simple, no-blank-canvas builder: pick a template, fill a few slots, and out comes
// a short link + branded QR + a print-ready flyer (vector SVG). Reuses the QR engine +
// the owner-credit-on-signup pipeline. Dashboard (no-rail) Focus surface.
//
// 🔴 FREE FOR ANY SIGNED-IN MEMBER (LIVE-221). This page used to answer a free member
// with a "Entry points are a Crew feature" upsell instead of the builder. Bringing
// people in is the act the whole growth model runs on, so it is never behind the paid
// tier. Sign-in is the only gate; the server action agrees (./actions.ts).

import { redirect } from 'next/navigation'
import { Megaphone, QrCode, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { listMyEntryPoints } from '@/lib/entry-points/store'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import { crewEntryTemplates } from '@/lib/entry-points/template-settings'
import { EntryPointsManager, type EntryCard } from './entry-points-client'

export const dynamic = 'force-dynamic'

export default async function EntryPointsPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/entry-points')

  const [entries, targets, templates] = await Promise.all([
    listMyEntryPoints(me.id),
    listMarketingTargets(me.id),
    crewEntryTemplates(),
  ])

  // Signups credited to this member (owner-credit on signup, ADR-091/126).
  const admin = createAdminClient()
  const { count: signups } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_profile_id', me.id)

  const totalScans = entries.reduce((sum, e) => sum + e.scans, 0)

  // Pre-render each QR (server) so the list paints instantly.
  const cards: EntryCard[] = entries.map((e) => ({
    id: e.id,
    slug: e.slug,
    url: shortLinkUrl(e.slug),
    title: e.title,
    destination: e.destination,
    templateId: e.templateId,
    flyer: e.flyer,
    scans: e.scans,
    qrSvg: renderStyledQrSvg(shortLinkUrl(e.slug), e.style, 200),
  }))

  const destinationGroups = entryDestinationGroups(targets)

  return (
    <DashboardTemplate
      eyebrow="Entry points"
      title="Bring people in"
      description="Pick a template, fill a few details, and get a branded flyer with your QR code. Download the vector or PNG. Every signup it brings in credits you."
      stats={
        <>
          <StatCard label="Entry points" value={entries.length} icon={Megaphone} />
          <StatCard label="Total scans" value={totalScans} icon={QrCode} />
          <StatCard label="Signups credited" value={signups ?? 0} icon={Users} />
        </>
      }
    >
      <EntryPointsManager cards={cards} destinationGroups={destinationGroups} templates={templates} />
    </DashboardTemplate>
  )
}
