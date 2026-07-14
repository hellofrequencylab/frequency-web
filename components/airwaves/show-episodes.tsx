'use client'

import { useState } from 'react'
import { Play, X } from 'lucide-react'
import { AirwavesPlayer } from '@/components/airwaves/player'

// Airwaves P3 — the listener EPISODE LIST for a public Show page (ADR-608). A client island so one
// Episode at a time can expand into the real <AirwavesPlayer> (speed control, MediaSession, resume)
// without mounting a heavy transport for every row. The server maps each public FeedEpisode onto the
// flat, serializable `ShowEpisodeItem` shape below (this file never imports `lib/airwaves/*`, keeping
// the server-only data layer out of the client bundle). Voice: plain, no em dashes; DAWN tokens only.

/** One chapter marker, in the shape the player reads. */
export interface ShowEpisodeChapter {
  startSec: number
  title: string
}

/** The flat, serializable Episode a listener row needs. Built on the server from a public FeedEpisode. */
export interface ShowEpisodeItem {
  id: string
  /** The in-page anchor (`#slug`) the RSS item link points at, so a deep link scrolls here. */
  anchor: string
  kind: 'audio' | 'video'
  src: string
  title: string
  description: string | null
  /** Human date label (e.g. "Jan 5, 2026"), or '' when unpublished. */
  dateLabel: string
  /** Human duration label (e.g. "1:01:01"), or '' when unknown. */
  durationLabel: string
  durationSec?: number
  artworkUrl?: string
  posterUrl?: string
  captionsUrl?: string
  transcript?: string
  chapters?: ShowEpisodeChapter[]
  /** The owning Space's name — the player's MediaSession "artist" line. */
  spaceName?: string
}

export function ShowEpisodes({ episodes }: { episodes: ShowEpisodeItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <ol className="flex flex-col gap-3">
      {episodes.map((ep) => {
        const active = ep.id === activeId
        return (
          <li
            key={ep.id}
            id={ep.anchor}
            className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => setActiveId(active ? null : ep.id)}
                aria-pressed={active}
                aria-label={active ? `Close ${ep.title}` : `Play ${ep.title}`}
                className="press mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {active ? <X className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
              </button>

              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-tight text-text">{ep.title}</h3>
                {(ep.dateLabel || ep.durationLabel) && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
                    {ep.dateLabel && <span>{ep.dateLabel}</span>}
                    {ep.dateLabel && ep.durationLabel && <span aria-hidden>·</span>}
                    {ep.durationLabel && <span className="tabular-nums">{ep.durationLabel}</span>}
                  </p>
                )}
                {ep.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{ep.description}</p>
                )}
              </div>
            </div>

            {active && (
              <div className="mt-4">
                <AirwavesPlayer
                  id={ep.id}
                  kind={ep.kind}
                  src={ep.src}
                  title={ep.title}
                  posterUrl={ep.posterUrl}
                  artworkUrl={ep.artworkUrl}
                  durationSec={ep.durationSec}
                  captionsUrl={ep.captionsUrl}
                  transcript={ep.transcript}
                  chapters={ep.chapters}
                  spaceName={ep.spaceName}
                  autoPlay
                />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
