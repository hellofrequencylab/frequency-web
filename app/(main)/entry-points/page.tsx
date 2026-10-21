// "My Entry Points" — every member's outreach portal (ADR-126, docs/ENTRY-POINTS.md).
// The simple, no-blank-canvas builder: pick a template, name it, and out comes
// a short link + branded QR. Reuses the QR engine + the owner-credit-on-signup
// pipeline. Dashboard (no-rail) Focus surface. Flyer builder deleted (LIVE-216).
//
// 🔴 FREE FOR ANY SIGNED-IN MEMBER (LIVE-221). This page used to answer a free member
// with a "Entry points are a Crew feature" upsell instead of the builder. Bringing
// people in is the act the whole growth model runs on, so it is never behind the paid
// tier. Sign-in is the only gate; the server action agrees (./actions.ts).

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { Megaphone, QrCode, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { loadEntryPoints } from './entry-points-data'
import { EntryPointsManager } from './entry-points-client'

export const dynamic = 'force-dynamic'

export default async function EntryPointsPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/entry-points')
  const { cards, templates, destinationGroups, totalScans, signups } = await loadEntryPoints(me.id)
  return (
    <DashboardTemplate
      eyebrow="Entry points"
      title="Bring people in"
      description="Pick a template, name it, and get a branded QR code plus a short link. Download the PNG or SVG. Every signup it brings in credits you."
      stats={
        <>
          <StatCard label="Entry points" value={cards.length} icon={Megaphone} />
          <StatCard label="Total scans" value={totalScans} icon={QrCode} />
          <StatCard label="Signups credited" value={signups} icon={Users} />
        </>
      }
    >
      <EntryPointsManager cards={cards} destinationGroups={destinationGroups} templates={templates} />
    </DashboardTemplate>
  )
}
