// Airwaves P1 — resolve one Recording to a gated player payload (ADR-608 §6a).
//
//   GET /api/airwaves/recordings/<id>
//
// The `recording` entity-block's client island calls this to hydrate. The gate is applied SERVER-SIDE
// (resolveRecordingForViewer → canViewRecording): a walled private Recording returns { status: 'locked' }
// with only a title, never the media src, so an un-entitled viewer can never read the file url off the
// wire. FAIL-SAFE: an unknown id returns { status: 'missing' }.

import { getMyProfileId } from '@/lib/auth'
import { resolveRecordingForViewer } from '@/lib/airwaves/playback'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewerProfileId = await getMyProfileId()
  const resolution = await resolveRecordingForViewer(id, viewerProfileId)
  // Always 200 with a status discriminant — the island renders the locked / missing state itself, and a
  // 404/403 would leak whether the id exists to an anonymous probe. No-store so a viewer's gate is never
  // cached across sessions.
  return Response.json(resolution, { headers: { 'cache-control': 'no-store' } })
}
