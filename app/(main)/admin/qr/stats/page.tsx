import { ChartNoAxesColumn, MapPin, Users, Link2, Trophy, UserCircle, Megaphone, Nfc, Compass } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { summarizeScans, summarizeLocations, type ScanRow, type ScanGeoRow } from '@/lib/qr/analytics'
import { summarizeAcquisition, type AcquisitionRow } from '@/lib/qr/acquisition'
import { Analytics, type AnalyticsData } from '../analytics'
import { ScanLocator } from '../scan-locator'

export const dynamic = 'force-dynamic'

// The QR stats dashboard — the analytics counterpart to the Studio. Tracks every
// function of the QR system: scan volume + funnel, where scans happen (locator map),
// the live code inventory, top locations, and top codes.
export default async function QrStatsPage() {
  await requireAdmin('host', { staff: 'qr' })
  const db = createAdminClient()

  const [{ data: scans }, { data: codes }, { count: nodeCount }, { data: events }, { data: challenges }, { data: acq }] =
    await Promise.all([
      db.from('qr_scans').select('qr_code_id, profile_id, scanned_at, city, country, lat, lng, medium'),
      db.from('qr_codes').select('id, slug, title, purpose, owner_profile_id'),
      db.from('nodes').select('id', { count: 'exact', head: true }),
      db.from('engagement_events').select('event_type').in('event_type', ['qr.referral_signup', 'qr.gift_zap']),
      db.from('season_challenges').select('id, criteria'),
      db.from('profiles').select('acquisition').not('acquisition', 'is', null),
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

  // Acquisition — how signups arrived (first-touch snapshots, ADR-107/111).
  const acqRows: AcquisitionRow[] = (acq ?? []).map((r) => {
    const a = (r.acquisition ?? null) as Record<string, unknown> | null
    return {
      channel: (a?.channel as string) ?? null,
      source: (a?.source as string) ?? null,
      campaign: (a?.campaign as string) ?? null,
      code: (a?.code as string) ?? null,
    }
  })
  const acquisition = summarizeAcquisition(acqRows)
  // Scan→signup conversion per code: scans (by slug) vs signups attributed to it.
  const slugById = new Map(allCodes.map((c) => [c.id, c.slug]))
  const scansBySlug = new Map<string, number>()
  for (const s of summary.perCode.values()) {
    const slug = slugById.get(s.codeId)
    if (slug) scansBySlug.set(slug, s.total)
  }
  const topAcqCodes = acquisition.byCode.slice(0, 8).map((b) => {
    const scans = scansBySlug.get(b.key) ?? 0
    return { slug: b.key, signups: b.count, scans, rate: scans > 0 ? Math.round((b.count / scans) * 100) : null }
  })

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
        <StatCard bordered icon={MapPin} label="Total scans" value={summary.total.toLocaleString()} />
        <StatCard bordered icon={Users} label="Unique members" value={summary.unique.toLocaleString()} />
        <StatCard bordered icon={UserCircle} label="Referral signups" value={referralSignups.toLocaleString()} />
        <StatCard bordered icon={Trophy} label="Zaps gifted" value={gifts.toLocaleString()} />
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
          <StatCard bordered icon={Link2} label="Dynamic links" value={dynamicLinks.toLocaleString()} />
          <StatCard bordered icon={MapPin} label="Check-in codes" value={(nodeCount ?? 0).toLocaleString()} />
          <StatCard bordered icon={UserCircle} label="Member codes" value={memberCodes.toLocaleString()} />
          <StatCard bordered icon={Megaphone} label="Marketing funnels" value={marketing.toLocaleString()} />
          <StatCard bordered icon={Trophy} label="Campaigns" value={campaignCount.toLocaleString()} />
        </div>
      </AdminSection>

      {/* Volume + top codes */}
      <AdminSection title="Scan volume & top codes">
        <Analytics data={analytics} />
      </AdminSection>

      {/* Acquisition — how signups arrived */}
      <AdminSection
        title="Acquisition"
        description="How members who signed up first arrived — by channel, source, and the specific code/poster."
      >
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard bordered icon={Compass} label="Attributed signups" value={acquisition.total.toLocaleString()} />
          <StatCard bordered icon={Nfc} label="NFC taps" value={summary.byMedium.nfc.toLocaleString()} />
          <StatCard bordered icon={MapPin} label="QR scans" value={summary.byMedium.qr.toLocaleString()} />
        </div>
        {acquisition.total === 0 ? (
          <p className="py-4 text-sm text-muted">
            No attributed signups yet — they appear here once members arrive via a tagged code.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankList title="By channel" rows={acquisition.byChannel} />
            <RankList title="By source / campaign" rows={acquisition.bySource} />
            <div className="lg:col-span-2 rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-bold text-text">Top codes — scan → signup</h3>
              </div>
              {topAcqCodes.length === 0 ? (
                <p className="p-4 text-xs text-muted">No code-attributed signups yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-subtle">
                      <th className="px-4 py-2 font-medium">Code</th>
                      <th className="px-4 py-2 text-right font-medium">Scans</th>
                      <th className="px-4 py-2 text-right font-medium">Signups</th>
                      <th className="px-4 py-2 text-right font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAcqCodes.map((c) => (
                      <tr key={c.slug} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-text">/q/{c.slug}</td>
                        <td className="px-4 py-2 text-right text-muted">{c.scans}</td>
                        <td className="px-4 py-2 text-right font-semibold text-text">{c.signups}</td>
                        <td className="px-4 py-2 text-right text-muted">{c.rate == null ? '—' : `${c.rate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function RankList({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-bold text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No data yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span className="truncate text-text">{r.key}</span>
              <span className="shrink-0 font-semibold text-text">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
