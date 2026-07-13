// Airwaves player — the narrow, LOCAL prop shape.
//
// This is a self-contained, presentational client player. It deliberately does NOT import the
// canonical `Recording` type from `lib/airwaves/*` (owned by the data-layer agent); it declares
// the minimum a player needs. At integration, the caller maps a canonical Recording onto this
// shape. Keep it small: every field here is something the transport, MediaSession, or a depth
// control actually reads.

/** A single chapter marker: where it starts and what to call it. */
export interface RecordingChapter {
  /** Seconds from the start of the recording. */
  startSec: number
  title: string
}

/** The minimal recording a player needs to render and drive playback. */
export interface PlayerRecording {
  id: string
  kind: 'audio' | 'video'
  /** The media URL (progressive MP3 / MP4, range-request seekable). */
  src: string
  title: string
  /** Video poster frame (video only). */
  posterUrl?: string
  /** Cover art for the now-playing card + MediaSession (audio, or a Show cover). */
  artworkUrl?: string
  /** Known duration in seconds, if the data layer has it (avoids a metadata round-trip for the label). */
  durationSec?: number
  /** Chapter markers; each seeks on click and marks the scrub bar. */
  chapters?: RecordingChapter[]
  /** A VTT captions/subtitles track URL (video). */
  captionsUrl?: string
  /** Plain-text transcript, rendered as an expandable, crawlable panel. */
  transcript?: string
  /** Show a download control only when true. */
  downloadable?: boolean
  /** The owning Space's name — becomes the MediaSession "artist" line. */
  spaceName?: string
}

/** Handlers the host page wires for a queue. Absent = no previous/next affordance. */
export interface PlayerQueueHandlers {
  onPrevious?: () => void
  onNext?: () => void
}
