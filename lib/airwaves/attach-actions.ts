'use server'

// Airwaves P1 — the polymorphic ATTACH actions (ADR-608 §6c, requirement #3). The reusable server seam the
// "pick a Recording" manager calls from ANY host editor (a Practice, a Journey or journey item, an Event, a
// Product, or the Space itself). Each action resolves the caller here (lib/auth is safe in a 'use server'
// module) and passes the actor id into the gated lib/airwaves/recordings seam, which re-authorizes on the
// Recording's OWNING Space (canEditProfile) — so a caller can only attach a Recording they may edit. The
// host binding is (host_kind, host_id); one Recording attaches to many hosts (recording_attachments).

import { getCallerProfile } from '@/lib/auth'
import {
  attachRecording,
  detachRecording,
  listAttachmentsFor,
  getRecordingById,
} from '@/lib/airwaves/recordings'
import type { RecordingHostKind } from '@/lib/airwaves/types'

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** One attached Recording as the manager renders it: the attach binding plus the Recording's own title +
 *  kind (resolved for display). */
export interface AttachedRecordingRow {
  recordingId: string
  title: string
  mediaKind: 'audio' | 'video'
}

/** Attach a Recording to a host. Idempotent (a repeat updates the row). Gated on the Recording's owning
 *  Space inside attachRecording. */
export async function attachRecordingToHost(
  recordingId: string,
  hostKind: RecordingHostKind,
  hostId: string,
): Promise<ActionResult<AttachedRecordingRow>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to attach a recording.' }

  const res = await attachRecording(viewerProfileId, { recordingId, hostKind, hostId })
  if (!res.ok) return res
  const recording = await getRecordingById(recordingId)
  return {
    ok: true,
    value: {
      recordingId,
      title: recording?.title ?? 'Recording',
      mediaKind: recording?.mediaKind ?? 'audio',
    },
  }
}

/** Detach a Recording from a host. Idempotent (a missing attach is a no-op success). */
export async function detachRecordingFromHost(
  recordingId: string,
  hostKind: RecordingHostKind,
  hostId: string,
): Promise<ActionResult<{ removed: boolean }>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to remove a recording.' }
  return detachRecording(viewerProfileId, { recordingId, hostKind, hostId })
}

/** The Recordings attached to a host, resolved to display rows (title + kind), in attach order. Service-role
 *  read; the surface that renders it gates display. FAIL-SAFE to []. */
export async function listAttachedRecordings(
  hostKind: RecordingHostKind,
  hostId: string,
): Promise<AttachedRecordingRow[]> {
  const attachments = await listAttachmentsFor(hostKind, hostId)
  const rows = await Promise.all(
    attachments.map(async (a) => {
      const recording = await getRecordingById(a.recordingId)
      if (!recording) return null
      return { recordingId: recording.id, title: recording.title, mediaKind: recording.mediaKind }
    }),
  )
  return rows.filter((r): r is AttachedRecordingRow => r !== null)
}
