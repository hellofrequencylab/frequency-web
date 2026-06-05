import { ChartNoAxesColumn, MapPin, Users, Link2, Trophy, UserCircle, Megaphone } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { summarizeScans, summarizeLocations, type ScanRow, type ScanGeoRow } from '@/lib/qr/analytics'
import { Analytics, type AnalyticsData } from '../analytics'
import { ScanLocator } from '../scan-locator'

export const dynamic = 'force-dynamic'

// The QR stats dashboard — the analytics counterpart to the Studio. Tracks every
// function of the QR system: scan volume + funnel, where scans happen (locator map),
// the live code inventory, top locations, and top codes.
export default async function QrStatsPage() {
  await requireAdmin('host')
  const db = createAdminClient()

  const [{ data: scans }, { data: codes }, { count: nodeCount }, { data: events }, { data: challenges }] =
    await Promise.all([
      db.from('qr_scans').select('qr_code_id, profile_id, scanned_at, city, country, lat, lng, medium'),
      db.from('qr_codes').select('id, slug, title, purpose, owner_profile_id'),
      db.from('nodes').select('id', { count: 'exact', head: true }),
      db.from('engagement_events').select('event_type').in('event_type', ['qr.referral_signup', 'qr.gift_zap']),
      db.from('season_challenges').select('id, criteria'),
    ])

  const scanRows = scans ?? []
  const summary = summarizeScans(scanRows as ScanRow[])
  const locations = summarizeLocations(scanRows as ScanGeoRow[])

  // Funnel (the in-app actions a scan drives).
  const referralSignups = (events ?? []).filter((e) => e.event_type === 'qr.referral_signup').length
  const gifts = (events ?? []).filter((e) => e.event_type === 'qr.gift_zap').length

  // Live code inventory.
  const allCodes = codes ?? []
  const dynamicLinks = allCodes.filter((c) => !c.owner_profile_id && !c.purpose).length
  const memberCodes = allCodes.filter((c) => c.purpose === 'connect').length
  const marketing = allCodes.filter((c) => c.owner_profile_id && !c.purpose).length
  const campaignCount = (challenges ?? []).filter(
    (c) => (c.criteria as Record<string, unknown> | null)?.type === 'qr_scan',
  ).length

  // Reuse the Analytics block (totals + 30-day + top codes).
  const codeTitle = new Map(allCodes.map((c) => [c.id, { title: c.title, slug: c.slug }]))
  const topCodes = [...summary.perCode.values()]
    .map((s) => {
      const c = codeTitle.get(s.codeId)
      return { id: s.codeId, title: c?.title ?? 'Unknown', slug: c?.slug ?? '', total: s.total, unique: s.unique }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
  const analytics: AnalyticsData = {
    total: summary.total,
    unique: summary.unique,
    nfc: summary.byMedium.nfc,
    daily: summary.daily,
    topCodes,
  }

  return (
    <AdminPage
      title="QR stats"
      icon={ChartNoAxesColumn}
      eyebrow="Platform"
      width="wide"
      description="Every function of the QR system at a glance — scans, where they happen, the funnel they drive, and the live code inventory."
    >
      {/* Funnel headline */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={MapPin} label="Total scans" value={summary.total} />
        <Stat icon={Users} label="Unique members" value={summary.unique} />
        <Stat icon={UserCircle} label="Referral signups" value={referralSignups} />
        <Stat icon={Trophy} label="Zaps gifted" value={gifts} />
      </div>

      {/* Locator map */}
      <AdminSection title="Where codes get scanned" description="Coarse, city-level (IP-derived) — no precise location is collected.">
        <ScanLocator locations={locations} />
        {locations.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {locations.slice(0, 6).map((l) => (
              <li key={l.key} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
                <span className="truncate text-text">
                  {l.city}
                  {l.country ? <span className="text-subtle"> · {l.country}</span> : null}
                </span>
                <span className="shrink-0 font-semibold text-text">{l.scans}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {/* Code inventory */}
      <AdminSection title="Code inventory" description="Everything live in the system.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat icon={Link2} label="Dynamic links" value={dynamicLinks} />
          <Stat icon={MapPin} label="Check-in codes" value={nodeCount ?? 0} />
          <Stat icon={UserCircle} label="Member codes" value={memberCodes} />
          <Stat icon={Megaphone} label="Marketing funnels" value={marketing} />
          <Stat icon={Trophy} label="Campaigns" value={campaignCount} />
        </div>
      </AdminSection>

      {/* Volume + top codes */}
      <AdminSection title="Scan volume & top codes">
        <Analytics data={analytics} />
      </AdminSection>
    </AdminPage>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  )
}
