import { QrCode } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage } from '@/components/admin/admin-page'
import { nodeUrl } from '@/lib/qr/links'
import { renderQrSvg } from '@/lib/qr/render'
import { QrStudio, type StudioNode } from './qr-studio'

export const dynamic = 'force-dynamic'

// QR Studio — the admin editor for the codes members scan to check in and earn.
// Each row is a `nodes` record; the capture pipeline (verify → ledger → zaps →
// practice.verified / partner redemption) is already wired, so this surface is
// pure authoring: create, tune the reward, preview the QR, print, retire.
export default async function QrStudioPage() {
  await requireAdmin('host')
  const db = createAdminClient()

  const [{ data: nodes }, { data: caps }, { data: partners }] = await Promise.all([
    db
      .from('nodes')
      .select('id, type, label, zaps_value, capture_rule, active, valid_until, partner_id, created_at')
      .order('created_at', { ascending: false }),
    db.from('captures').select('node_id').eq('verified', true),
    db.from('partners').select('id, name').order('name'),
  ])

  // Tally verified captures per node in one pass (avoids N count queries).
  const counts = new Map<string, number>()
  for (const c of caps ?? []) counts.set(c.node_id, (counts.get(c.node_id) ?? 0) + 1)

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
        captures: counts.get(n.id) ?? 0,
        url,
        svg: await renderQrSvg(url, 168),
      }
    }),
  )

  return (
    <AdminPage
      title="QR Studio"
      icon={QrCode}
      eyebrow="Community"
      width="wide"
      description="Create and manage the codes members scan to check in and earn. Each code is dynamic — change its reward or retire it without reprinting."
    >
      <QrStudio initialNodes={initialNodes} partners={partners ?? []} />
    </AdminPage>
  )
}
