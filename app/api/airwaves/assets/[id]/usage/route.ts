// Airwaves P2 — the Loom "where is this used" endpoint (ADR-608 §7e).
//
//   GET /api/airwaves/assets/<id>/usage
//
// The Loom asset detail panel (janitor surface) calls this to show which Recordings reference a file and
// where they play. JANITOR-GATED: the reverse lookup reads across the service-role Airwaves tables, so only
// a platform operator (who already manages the Loom) may see it. A non-operator gets 403.

import { requireAdmin } from '@/lib/admin/guard'
import { getLoomAssetUsage } from '@/lib/airwaves/asset-usage'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin('janitor')
  } catch {
    return Response.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const { id } = await params
  const usage = await getLoomAssetUsage(id)
  return Response.json(usage, { headers: { 'cache-control': 'no-store' } })
}
