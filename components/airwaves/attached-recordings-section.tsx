// Airwaves P1 — the read-side "Recordings on this host" section (ADR-608 §6c). A self-fetching async Server
// Component that renders the Recordings attached to a host (a Practice, Journey, journey item, Event,
// Product, or Space) and returns NULL when there are none, mirroring the UsedInSection contract. Each
// Recording renders through the gated client player island (RecordingBlockEmbed), so a walled private
// Recording shows a locked card, never the file. Drop it on a host page inside a <Suspense> so it never
// blocks the shell (PAGE-FRAMEWORK §5).

import { Radio } from 'lucide-react'
import { listAttachmentsFor, getRecordingById } from '@/lib/airwaves/recordings'
import { RecordingBlockEmbed } from './recording-block-embed'
import type { RecordingHostKind } from '@/lib/airwaves/types'

export async function AttachedRecordingsSection({
  hostKind,
  hostId,
  title = 'Recordings',
  compact = false,
}: {
  hostKind: RecordingHostKind
  hostId: string
  title?: string
  /** Render the players in the compact (narrower) style. */
  compact?: boolean
}) {
  const attachments = await listAttachmentsFor(hostKind, hostId)
  if (attachments.length === 0) return null

  // Keep only attachments whose Recording still exists (a deleted Recording cascades its attach, but guard).
  const ids: string[] = []
  for (const a of attachments) {
    const recording = await getRecordingById(a.recordingId)
    if (recording) ids.push(recording.id)
  }
  if (ids.length === 0) return null

  return (
    <section className="mt-6 border-t border-border pt-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-subtle">
        <Radio className="h-4 w-4 text-primary-strong" aria-hidden /> {title}
      </h2>
      <div className="space-y-4">
        {ids.map((id) => (
          <RecordingBlockEmbed key={id} recordingId={id} display={compact ? 'compact' : 'full'} />
        ))}
      </div>
    </section>
  )
}
