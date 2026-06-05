// "My Entry Points" — the crew portal (ADR-126, docs/ENTRY-POINTS.md). The simple,
// no-blank-canvas builder: pick a template, fill a few slots, and out comes a short
// link + branded QR + a print-ready flyer (vector SVG). Crew-gated; reuses the QR
// engine + the owner-credit-on-signup pipeline. Dashboard (no-rail) Focus surface.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, QrCode, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { listMyEntryPoints } from '@/lib/entry-points/store'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import { EntryPointsManager, type EntryCard } from './entry-points-client'

export const dynamic = 'force-dynamic'

export default async function EntryPointsPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/entry-points')

  // Not crew yet — a friendly upsell, not a wall.
  if (!atLeastRole(me.community_role, 'crew')) {
    return (
      <DashboardTemplate eyebrow="Entry points" title="Bring people in" width="default">
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <Megaphone className="mx-auto h-8 w-8 text-primary-strong" aria-hidden />
          <p className="mt-3 text-lg font-bold text-text">Entry points are a Crew feature</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Crew can spin up a branded flyer with a QR code in under a minute — and earn for every
            person it brings in. Join Crew to start your own.
          </p>
          <Link
            href="/upgrade"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-pop transition-colors hover:bg-primary-hover"
          >
            Become Crew
          </Link>
        </div>
      </DashboardTemplate>
    )
  }

  const [entries, targets] = await Promise.all([
    listMyEntryPoints(me.id),
    listMarketingTargets(me.id),
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
      description="Pick a template, fill a few details, and get a branded flyer with your QR code — download the vector or PNG. Every signup it brings in credits you."
      stats={
        <>
          <StatCard label="Entry points" value={entries.length} icon={Megaphone} />
          <StatCard label="Total scans" value={totalScans} icon={QrCode} />
          <StatCard label="Signups credited" value={signups ?? 0} icon={Users} />
        </>
      }
    >
      <EntryPointsManager cards={cards} destinationGroups={destinationGroups} />
    </DashboardTemplate>
  )
}
