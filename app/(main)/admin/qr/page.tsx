import { QrCode } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage } from '@/components/admin/admin-page'
import { nodeUrl, shortLinkUrl } from '@/lib/qr/links'
import { renderQrSvg } from '@/lib/qr/render'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle } from '@/lib/qr/style'
import { summarizeScans, type ScanRow } from '@/lib/qr/analytics'
import { QrStudioTabs } from './qr-studio-tabs'
import type { StudioNode } from './qr-studio'
import type { StudioLink, NodeOption } from './dynamic-links'
import type { AnalyticsData } from './analytics'

export const dynamic = 'force-dynamic'

// QR Studio — the home for everything codes. Three tabs:
//   • Check-in codes — physical `nodes` that earn (verify → ledger → zaps)
//   • Dynamic links  — retargetable /q/<slug> codes (redirect to a URL or a node)
//   • Analytics      — scan totals + per-code performance from `qr_scans`
// All QR images are rendered server-side here and handed down as SVG strings.
export default async function QrStudioPage() {
  await requireAdmin('host')
  const db = createAdminClient()

  const [{ data: nodes }, { data: caps }, { data: links }, { data: scans }, { data: partners }] =
    await Promise.all([
      db
        .from('nodes')
        .select('id, type, label, zaps_value, capture_rule, active, valid_until, partner_id, created_at')
        .order('created_at', { ascending: false }),
      db.from('captures').select('node_id').eq('verified', true),
      db
        .from('qr_codes')
        .select('id, slug, title, destination_type, target_url, node_id, partner_id, active, valid_until, scan_count, style, created_at')
        .order('created_at', { ascending: false }),
      db.from('qr_scans').select('qr_code_id, profile_id, scanned_at'),
      db.from('partners').select('id, name').order('name'),
    ])

  // ── Check-in codes (nodes) ──────────────────────────────────────────────────
  const captureCounts = new Map<string, number>()
  for (const c of caps ?? []) captureCounts.set(c.node_id, (captureCounts.get(c.node_id) ?? 0) + 1)

  const initialNodes: StudioNode[] = await Promise.all(
    (nodes ?? []).map(async (n) => {
      const url = nodeUrl(n.id)
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        zaps_value: n.zaps_value,
        capture_rule: n.capture_rule,
        active: n.active,
        valid_until: n.valid_until,
        partner_id: n.partner_id,
        captures: captureCounts.get(n.id) ?? 0,
        url,
        svg: await renderQrSvg(url, 168),
      }
    }),
  )

  // ── Dynamic links (qr_codes) + per-code scan stats ──────────────────────────
  const summary = summarizeScans((scans ?? []) as ScanRow[])
  const nodeLabels = new Map((nodes ?? []).map((n) => [n.id, n.label ?? `${n.type} code`]))

  const initialLinks: StudioLink[] = await Promise.all(
    (links ?? []).map(async (l) => {
      const url = shortLinkUrl(l.slug)
      const stat = summary.perCode.get(l.id)
      const style = parseStyle(l.style)
      return {
        id: l.id,
        slug: l.slug,
        title: l.title,
        destination_type: l.destination_type as 'url' | 'node',
        target_url: l.target_url,
        node_id: l.node_id,
        node_label: l.node_id ? nodeLabels.get(l.node_id) ?? null : null,
        partner_id: l.partner_id,
        active: l.active,
        valid_until: l.valid_until,
        scans: l.scan_count,
        unique: stat?.unique ?? 0,
        style,
        url,
        svg: renderStyledQrSvg(url, style, 168),
      }
    }),
  )

  const nodeOptions: NodeOption[] = (nodes ?? []).map((n) => ({
    id: n.id,
    label: n.label ?? `${n.type} code`,
  }))

  // ── Analytics (serializable) ────────────────────────────────────────────────
  const topCodes = [...summary.perCode.values()]
    .map((s) => {
      const link = (links ?? []).find((l) => l.id === s.codeId)
      return { id: s.codeId, title: link?.title ?? 'Unknown', slug: link?.slug ?? '', total: s.total, unique: s.unique }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const analytics: AnalyticsData = {
    total: summary.total,
    unique: summary.unique,
    daily: summary.daily,
    topCodes,
  }

  return (
    <AdminPage
      title="QR Studio"
      icon={QrCode}
      eyebrow="Community"
      width="wide"
      description="Create and manage every code members scan — check-in codes that earn, retargetable dynamic links, and the scans they drive. Codes are dynamic; edit or retire them without reprinting."
    >
      <QrStudioTabs
        nodeProps={{ initialNodes, partners: partners ?? [] }}
        linkProps={{ initialLinks, nodes: nodeOptions, partners: partners ?? [] }}
        analytics={analytics}
      />
    </AdminPage>
  )
}
