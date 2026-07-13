// Airwaves P1 — list a Space's Recordings for the editor picker (ADR-608 §6a/§6c).
//
//   GET /api/airwaves/spaces/<slug>/recordings
//
// The `recordingPicker` field control (block editor + host attach UI) calls this to offer the current
// Space's Recordings. Gated to Space EDITORS (owner / admin / editor) — the picker is an authoring
// affordance, so a non-editor gets an empty list, never the catalog. Returns a compact
// { id, title, mediaKind, durationSeconds }[] the single-select renders.

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listRecordingsForSpace } from '@/lib/airwaves/recordings'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return Response.json({ recordings: [] }, { headers: { 'cache-control': 'no-store' } })

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) {
    return Response.json({ recordings: [] }, { headers: { 'cache-control': 'no-store' } })
  }

  const recordings = (await listRecordingsForSpace(space.id)).map((r) => ({
    id: r.id,
    title: r.title,
    mediaKind: r.mediaKind,
    durationSeconds: r.durationSeconds,
  }))
  return Response.json({ recordings }, { headers: { 'cache-control': 'no-store' } })
}
