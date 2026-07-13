'use client'

// Airwaves P1 — the `recording` entity-block's CLIENT ISLAND (ADR-608 §6a). The server renderer
// (content-block-view) is presentational + sync, so it mounts this thin wrapper the same way the `embed`
// block mounts an <iframe>. This island hydrates by calling the GATED resolve route
// (/api/airwaves/recordings/<id>), which applies canViewRecording server-side: an un-entitled viewer gets
// a locked card, never a playable src. Fail-safe: an empty id or a missing Recording renders nothing on a
// live page (a small hint in the editor preview), so a stray block never leaves a hollow box.

import { useEffect, useState } from 'react'
import { Lock, Radio } from 'lucide-react'
import { AirwavesPlayer, type PlayerRecording } from '@/components/airwaves/player'

type Resolution =
  | { status: 'ok'; recording: PlayerRecording }
  | { status: 'locked'; title: string; mediaKind: 'audio' | 'video' }
  | { status: 'missing' }

export interface RecordingBlockEmbedProps {
  recordingId: string
  display?: 'full' | 'compact'
  autoplay?: boolean
  showTranscript?: boolean
}

export function RecordingBlockEmbed({
  recordingId,
  display = 'full',
  autoplay = false,
  showTranscript = true,
}: RecordingBlockEmbedProps) {
  const [state, setState] = useState<Resolution | { status: 'loading' }>({ status: 'loading' })

  useEffect(() => {
    const id = (recordingId ?? '').trim()
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to the empty state when the id clears
      setState({ status: 'missing' })
      return
    }
    let live = true
    setState({ status: 'loading' })
    fetch(`/api/airwaves/recordings/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<Resolution>) : Promise.reject(new Error('bad response'))))
      .then((res) => {
        if (live) setState(res)
      })
      .catch(() => {
        if (live) setState({ status: 'missing' })
      })
    return () => {
      live = false
    }
  }, [recordingId])

  const wrap = display === 'compact' ? 'mx-auto max-w-md' : 'w-full'

  if (state.status === 'loading') {
    return (
      <div className={`${wrap} animate-pulse rounded-2xl border border-border bg-surface p-6`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-elevated" />
          <div className="h-3 w-40 rounded bg-surface-elevated" />
        </div>
      </div>
    )
  }

  if (state.status === 'locked') {
    return (
      <div className={`${wrap} rounded-2xl border border-border bg-surface p-6 text-center`}>
        <Lock className="mx-auto mb-2 h-5 w-5 text-subtle" aria-hidden />
        <p className="text-sm font-semibold text-text">{state.title}</p>
        <p className="mt-1 text-xs text-muted">Join this space to listen.</p>
      </div>
    )
  }

  if (state.status === 'missing') {
    // Nothing to show on a live page. In the editor the operator sees a hint until they pick a Recording.
    return (
      <div className={`${wrap} rounded-2xl border border-dashed border-border bg-surface p-6 text-center`}>
        <Radio className="mx-auto mb-2 h-5 w-5 text-subtle" aria-hidden />
        <p className="text-xs text-muted">Pick a recording to play it here.</p>
      </div>
    )
  }

  const recording = showTranscript ? state.recording : { ...state.recording, transcript: undefined }
  return (
    <div className={wrap}>
      <AirwavesPlayer {...recording} autoPlay={autoplay} />
    </div>
  )
}
