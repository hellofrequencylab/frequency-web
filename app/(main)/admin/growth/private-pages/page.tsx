import { Eye } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatTimeShort } from '@/lib/format-date'
import { HOME_TZ } from '@/lib/time/home-zone'
import { loadPrivateReads, type ClickRow, type ReaderSummary } from '@/lib/how/private-readers'

export const dynamic = 'force-dynamic'

// PRIVATE PAGES: who opened the link-only partner pages (/how, /facilities, /lab) and what they clicked
// (owner 2026-11-17). Every row is first-party (engagement_events via /api/how/beacon); nothing here
// went to a pixel. Give each person their own link, e.g. frequencylocal.com/facilities?r=jane, and the
// code carries to the other private pages in the same tab. Staff visits are excluded at the beacon.
// Gate: platform admin, the same floor as the rest of the growth reads.
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

export default async function PrivatePagesReadersPage() {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const { readers, clicks, capped } = await loadPrivateReads()

  return (
    <AdminTemplate
      title="Private pages"
      icon={Eye}
      eyebrow="Growth"
      width="wide"
      description="Who opened /how, /facilities and /lab in the last 90 days, how far they read, and every click. Share each person their own link with ?r=their-name on the end."
      back={{ href: '/admin/growth', label: 'Growth' }}
    >
      <AdminSection title="Readers" description={capped ? 'Showing the newest 20,000 events.' : undefined}>
        <DataTable
          columns={READER_COLUMNS}
          rows={readers}
          getRowId={(r) => r.reader}
          caption="Readers of the private pages"
          density="compact"
          empty={<EmptyState icon={Eye} title="No readers yet" description="Share a link like frequencylocal.com/facilities?r=jane and the visit shows up here." />}
        />
      </AdminSection>
      <AdminSection title="Clicks" description="Every link, button and form on the private pages, newest first. A form records only the option picked, never what was typed.">
        <DataTable
          columns={CLICK_COLUMNS}
          rows={clicks.slice(0, 500)}
          getRowId={(c) => `${c.at}-${c.reader}-${c.target}-${c.label}`}
          caption="Clicks on the private pages"
          density="compact"
          empty={<EmptyState title="No clicks yet" />}
        />
      </AdminSection>
    </AdminTemplate>
  )
}
