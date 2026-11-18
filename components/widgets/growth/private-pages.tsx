import { Eye } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatTimeShort } from '@/lib/format-date'
import { HOME_TZ } from '@/lib/time/home-zone'
import { loadPrivateReads, type ClickRow, type ReaderSummary } from '@/lib/how/private-readers'

// PRIVATE PAGES (LIVE-2345, LIVE-2380): who opened the link-only partner pages under /build and what they clicked
// (owner 2026-11-17). Every row is first-party (engagement_events via /api/how/beacon); nothing here
// went to a pixel. Give each person their own link, e.g. frequencylocal.com/build/facilities?r=jane, and the
// code carries to the other private pages in the same tab. Staff visits are excluded at the beacon.
// Rendered ONLY by the gated Growth dashboard (app/(main)/admin/growth/page.tsx), so it never re-gates.
// It lives there rather than on its own route because a new route is a new serverless function, and the
// deploy sat at 7.99 of the 8 GB check:build-budget (2026-11-17): one more function failed the build.
const TZ = HOME_TZ
const when = (iso: string) => `${formatDateShort(iso, TZ)}, ${formatTimeShort(iso, TZ)}`
const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)

const READER_COLUMNS: ColumnDef<ReaderSummary>[] = [
  { key: 'reader', header: 'Reader', render: (r) => (r.tagged ? <b>{r.reader}</b> : <span className="text-muted">No code ({r.reader.slice(6)})</span>) },
  { key: 'pages', header: 'Pages', render: (r) => r.pages.join(', ') },
  { key: 'lastSeen', header: 'Last seen', render: (r) => when(r.lastSeen) },
  { key: 'visits', header: 'Visits', type: 'number', align: 'right' },
  { key: 'engagedS', header: 'Time engaged', align: 'right', render: (r) => mins(r.engagedS) },
  { key: 'maxPct', header: 'Scrolled', align: 'right', render: (r) => `${r.maxPct}%` },
  { key: 'clicks', header: 'Clicks', type: 'number', align: 'right' },
  { key: 'finished', header: 'Finished', render: (r) => (r.finished ? 'Yes' : 'No') },
  { key: 'device', header: 'Device', render: (r) => r.device || '' },
]

const CLICK_COLUMNS: ColumnDef<ClickRow>[] = [
  { key: 'at', header: 'When', render: (c) => when(c.at) },
  { key: 'reader', header: 'Reader', render: (c) => (c.reader.startsWith('visit:') ? <span className="text-muted">No code</span> : c.reader) },
  { key: 'page', header: 'Page' },
  { key: 'kind', header: 'Where' },
  { key: 'label', header: 'Clicked', render: (c) => c.label || c.target },
  { key: 'target', header: 'Goes to' },
]

export async function GrowthPrivatePages() {
  const { readers, clicks, capped } = await loadPrivateReads()

  return (
    <div id="private-pages" className="scroll-mt-24">
      <AdminSection
        title="Private pages: readers"
        description={`Who opened the partner pages under /build in the last 90 days and how far they read. Share each person their own link with ?r=their-name on the end.${capped ? ' Showing the newest 20,000 events.' : ''}`}
      >
        <DataTable
          columns={READER_COLUMNS}
          rows={readers}
          getRowId={(r) => r.reader}
          caption="Readers of the private pages"
          density="compact"
          empty={<EmptyState icon={Eye} title="No readers yet" description="Share a link like frequencylocal.com/build/vision?r=jane and the visit shows up here." />}
        />
      </AdminSection>
      <AdminSection title="Private pages: clicks" description="Every link, button and form on the private pages, newest first. A form records only the option picked, never what was typed.">
        <DataTable
          columns={CLICK_COLUMNS}
          rows={clicks.slice(0, 500)}
          getRowId={(c) => `${c.at}-${c.reader}-${c.target}-${c.label}`}
          caption="Clicks on the private pages"
          density="compact"
          empty={<EmptyState title="No clicks yet" />}
        />
      </AdminSection>
    </div>
  )
}
