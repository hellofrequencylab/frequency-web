import { Megaphone, QrCode, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { loadEntryPoints } from '@/app/(main)/entry-points/entry-points-data'
import { EntryPointsManager } from '@/app/(main)/entry-points/entry-points-client'

// The operator console's door to Entry points (Growth, Acquisition). The tool itself is the member page at
// /entry-points, free for every signed-in member; staff open it here so it sits inside the console with the
// rest of its section instead of in the member shell. Same gate as its menu row: host and up, or the
// marketing staff domain.
export const dynamic = 'force-dynamic'

export default async function AdminEntryPoints() {
  await requireAdmin('host', { staff: 'marketing' })
  const { cards, templates, destinationGroups, totalScans, signups } = await loadEntryPoints('/admin/entry-points')
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
