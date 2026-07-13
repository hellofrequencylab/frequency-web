'use client'

// The Airwaves player (Airwaves plan §6b/§7, items 5/6/7/9). A self-contained, presentational
// client island: one <audio> or <video> element plus a tokenized control surface. It owns transport
// (play/pause, seek with buffered range, 15s skips, volume), the persisted speed selector (item 6),
// lock-screen / background control via the MediaSession API (item 7), a throttled resume position
// (item 4), and the depth layer (captions, chapters, transcript, download, share; item 5/9).
//
// Data-layer clean: no DB, no schema, no `lib/airwaves/*`, no `next/headers`, no `lib/auth`. It
// reads a narrow local prop shape (./types) that the caller maps onto the canonical Recording at
// integration. A single long-lived media element (never remounted mid-session) is what lets audio
// keep playing under screen lock; a persistent shell mount is a later composition of this same
// component.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  LoaderCircle,
  TriangleAlert,
  Download,
  Share2,
  Link2,
  ListMusic,
  FileText,
  ChevronDown,
  Captions as CaptionsIcon,
  Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlaybackRate } from './use-playback-rate'
import {
  formatTime,
  formatRemaining,
  formatRate,
  describeResume,
  positionKey,
  activeChapterIndex,
  POSITION_WRITE_INTERVAL_MS,
} from './playback'
import type { PlayerRecording, PlayerQueueHandlers } from './types'

const SKIP_SECONDS = 15

export interface AirwavesPlayerProps extends PlayerRecording, PlayerQueueHandlers {
  /** Start playing on mount where the browser's autoplay policy allows it. Default false. */
  autoPlay?: boolean
  className?: string
}

type MediaEl = HTMLVideoElement | HTMLAudioElement

export function AirwavesPlayer({
  id,
  kind,
  src,
  title,
  posterUrl,
  artworkUrl,
  durationSec,
  chapters,
  captionsUrl,
  transcript,
  downloadable,
  spaceName,
  onPrevious,
  onNext,
  autoPlay = false,
  className,
}: AirwavesPlayerProps) {
  const mediaRef = useRef<MediaEl | null>(null)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [errored, setErrored] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(durationSec ?? 0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  const [captionsOn, setCaptionsOn] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resumeAt, setResumeAt] = useState<number | null>(null)

  const { rate, cycle: cycleRatePref } = usePlaybackRate()

  const hasChapters = !!chapters && chapters.length > 0
  const hasCaptions = kind === 'video' && !!captionsUrl
  const activeChapter = useMemo(
    () => (hasChapters ? activeChapterIndex(chapters, current) : -1),
    [hasChapters, chapters, current],
  )

  // ── Stable transport primitives (read the live element; safe as MediaSession handlers) ─────────
  const play = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    void el.play().catch(() => {
      /* autoplay/gesture policy rejected the start; the user can tap play. */
    })
  }, [])

  const pause = useCallback(() => {
    mediaRef.current?.pause()
  }, [])

  const togglePlay = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) play()
    else pause()
  }, [play, pause])

  const seekTo = useCallback((time: number) => {
    const el = mediaRef.current
    if (!el) return
    const dur = Number.isFinite(el.duration) ? el.duration : time
    el.currentTime = Math.max(0, Math.min(time, dur || time))
  }, [])

  const skip = useCallback((delta: number) => {
    const el = mediaRef.current
    if (!el) return
    seekTo(el.currentTime + delta)
  }, [seekTo])

  // ── Apply the persisted speed whenever it changes or the element (re)mounts ─────────────────────
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = rate
  }, [rate, ready])

  // ── Read any saved resume position on mount (surface it as an affordance, never a surprise seek) ─
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(positionKey(id))
      const saved = raw != null ? Number(raw) : NaN
      // Client-only read after mount (server render carries no resume banner, so hydration matches).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(saved) && saved > SKIP_SECONDS) setResumeAt(saved)
    } catch {
      /* localStorage blocked — no resume affordance, playback still works. */
    }
  }, [id])

  // ── Throttled position persistence ──────────────────────────────────────────────────────────────
  const lastWriteRef = useRef(0)
  const persistPosition = useCallback(
    (force = false) => {
      const el = mediaRef.current
      if (!el || typeof window === 'undefined') return
      const now = Date.now()
      if (!force && now - lastWriteRef.current < POSITION_WRITE_INTERVAL_MS) return
      lastWriteRef.current = now
      try {
        const t = el.currentTime
        const dur = el.duration
        // Clear near the end (finished) so it doesn't resume 2s from done; else store the spot.
        if (Number.isFinite(dur) && dur > 0 && t >= dur - 2) window.localStorage.removeItem(positionKey(id))
        else if (t > SKIP_SECONDS) window.localStorage.setItem(positionKey(id), String(Math.floor(t)))
      } catch {
        /* ignore quota/security errors */
      }
    },
    [id],
  )

  // ── Wire the media element's events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return

    const onLoadedMeta = () => {
      setReady(true)
      if (Number.isFinite(el.duration)) setDuration(el.duration)
      el.playbackRate = rate
    }
    const onTimeUpdate = () => {
      setCurrent(el.currentTime)
      persistPosition()
      // Keep the lock-screen scrubber in sync (guarded; not on every platform).
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          if (Number.isFinite(el.duration) && el.duration > 0) {
            navigator.mediaSession.setPositionState?.({
              duration: el.duration,
              position: Math.min(el.currentTime, el.duration),
              playbackRate: el.playbackRate,
            })
          }
        } catch {
          /* setPositionState can throw if values are inconsistent mid-seek */
        }
      }
    }
    const onProgress = () => {
      try {
        if (el.buffered.length > 0) setBufferedEnd(el.buffered.end(el.buffered.length - 1))
      } catch {
        /* buffered can throw before any data */
      }
    }
    const onDurationChange = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration)
    }
    const onPlay = () => {
      setPlaying(true)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    }
    const onPause = () => {
      setPlaying(false)
      persistPosition(true)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
    const onWaiting = () => setWaiting(true)
    const onPlaying = () => {
      setWaiting(false)
      setErrored(false)
    }
    const onCanPlay = () => setWaiting(false)
    const onVolume = () => {
      setVolume(el.volume)
      setMuted(el.muted)
    }
    const onEnded = () => {
      setPlaying(false)
      persistPosition(true)
      onNext?.()
    }
    const onError = () => {
      setErrored(true)
      setWaiting(false)
    }

    el.addEventListener('loadedmetadata', onLoadedMeta)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('progress', onProgress)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('canplay', onCanPlay)
    el.addEventListener('volumechange', onVolume)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    // Best-effort flush on tab hide (a killed tab never fires 'pause').
    const onHide = () => persistPosition(true)
    document.addEventListener('visibilitychange', onHide)

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMeta)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('progress', onProgress)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('waiting', onWaiting)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('canplay', onCanPlay)
      el.removeEventListener('volumechange', onVolume)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onHide)
    }
    // Re-bind when the source changes (a new Recording) so listeners point at fresh state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, persistPosition, onNext])

  // ── MediaSession metadata (item 7): the now-playing card on the lock screen ─────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title,
        artist: spaceName ?? 'Airwaves',
        album: spaceName ?? undefined,
        artwork: artworkUrl
          ? [96, 128, 192, 256, 384, 512].map((s) => ({
              src: artworkUrl,
              sizes: `${s}x${s}`,
              type: 'image/png',
            }))
          : [],
      })
    } catch {
      /* MediaMetadata unsupported — the transport handlers below still work. */
    }
  }, [title, spaceName, artworkUrl])

  // ── MediaSession action handlers (item 7): lock-screen / headset / Bluetooth transport ──────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        /* action unsupported on this platform — expected, ignore */
      }
    }
    set('play', () => play())
    set('pause', () => pause())
    set('seekbackward', (d) => skip(-(d.seekOffset ?? SKIP_SECONDS)))
    set('seekforward', (d) => skip(d.seekOffset ?? SKIP_SECONDS))
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') seekTo(d.seekTime)
    })
    set('previoustrack', onPrevious ? () => onPrevious() : null)
    set('nexttrack', onNext ? () => onNext() : null)

    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as const) {
        set(a, null)
      }
    }
  }, [play, pause, skip, seekTo, onPrevious, onNext])

  // ── Depth actions ───────────────────────────────────────────────────────────────────────────────
  const toggleCaptions = useCallback(() => {
    const el = mediaRef.current
    if (!el || !el.textTracks || el.textTracks.length === 0) return
    const track = el.textTracks[0]
    const next = track.mode === 'showing' ? 'hidden' : 'showing'
    track.mode = next
    setCaptionsOn(next === 'showing')
  }, [])

  const share = useCallback(async () => {
    let url = ''
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      const t = Math.floor(mediaRef.current?.currentTime ?? 0)
      if (t > 0) u.searchParams.set('t', String(t))
      url = u.toString()
    }
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav?.share) {
      try {
        await nav.share({ title, url })
        return
      } catch {
        /* user cancelled or share failed — fall through to copy */
      }
    }
    if (nav?.clipboard?.writeText && url) {
      try {
        await nav.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      } catch {
        /* clipboard blocked — nothing to do */
      }
    }
  }, [title])

  const useResume = useCallback(() => {
    if (resumeAt != null) {
      seekTo(resumeAt)
      play()
    }
    setResumeAt(null)
  }, [resumeAt, seekTo, play])

  // ── Derived display ─────────────────────────────────────────────────────────────────────────────
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0
  const spinning = waiting && !errored

  const iconBtn =
    'inline-flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40'

  return (
    <section
      className={cn('overflow-hidden rounded-2xl border border-border bg-surface', className)}
      aria-label={`Player: ${title}`}
    >
      {/* The media stage — video shows the frame; audio shows a cover + title card. */}
      {kind === 'video' ? (
        <div className="relative aspect-video bg-ink">
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={src}
            poster={posterUrl}
            playsInline
            autoPlay={autoPlay}
            preload="metadata"
            className="h-full w-full"
            onClick={togglePlay}
          >
            {hasCaptions && <track kind="captions" src={captionsUrl} label="Captions" default />}
          </video>
          {spinning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/30">
              <LoaderCircle className="h-8 w-8 animate-spin text-on-ink" aria-hidden />
              <span className="sr-only">Loading</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4 border-b border-border bg-surface-elevated/40 p-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-elevated">
            {artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artworkUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Radio className="h-7 w-7 text-subtle" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{title}</p>
            {spaceName && <p className="truncate text-xs text-muted">{spaceName}</p>}
          </div>
          {spinning && <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-subtle" aria-hidden />}
          {/* Audio still needs a real media element; it carries no visual, so it lives here. */}
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={src}
            autoPlay={autoPlay}
            preload="metadata"
            className="hidden"
          />
        </div>
      )}

      {/* Error state — the transport is meaningless without a source. */}
      {errored ? (
        <div className="flex items-center gap-3 p-4">
          <TriangleAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">This recording will not play right now.</p>
            <p className="text-xs text-muted">Check your connection and try again.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrored(false)
              mediaRef.current?.load()
            }}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-elevated"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {/* Resume affordance (item 4). */}
          {resumeAt != null && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/50 px-3 py-2">
              <button
                type="button"
                onClick={useResume}
                className="text-sm font-semibold text-primary-strong hover:underline"
              >
                {describeResume(resumeAt)}
              </button>
              <button
                type="button"
                onClick={() => setResumeAt(null)}
                className="ml-auto text-xs text-subtle hover:text-text"
              >
                Start over
              </button>
            </div>
          )}

          {/* Scrubber: buffered range behind, played in front, chapter ticks, and a transparent
              native range on top for keyboard + pointer seek (accessible by default). */}
          <div className="space-y-1.5">
            <div className="group relative h-6">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-elevated peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                <div className="absolute inset-y-0 left-0 bg-border-strong/50" style={{ width: `${bufferedPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
              </div>
              {/* Chapter markers. */}
              {hasChapters &&
                duration > 0 &&
                chapters!.map((c, i) => (
                  <span
                    key={i}
                    className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-canvas/70"
                    style={{ left: `${Math.min(100, (c.startSec / duration) * 100)}%` }}
                    aria-hidden
                  />
                ))}
              <span
                className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow"
                style={{ left: `${pct}%` }}
                aria-hidden
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(current, duration || 0)}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Seek"
                aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
                disabled={!ready}
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
              />
            </div>
            <div className="flex items-center justify-between text-2xs tabular-nums text-subtle">
              <span>{formatTime(current)}</span>
              <span>{formatRemaining(current, duration)}</span>
            </div>
          </div>

          {/* Transport row. */}
          <div className="flex items-center gap-1">
            {onPrevious && (
              <button type="button" onClick={onPrevious} className={cn(iconBtn, 'h-9 w-9')} aria-label="Previous recording">
                <StepBack className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => skip(-SKIP_SECONDS)}
              className={cn(iconBtn, 'h-9 w-9')}
              aria-label={`Skip back ${SKIP_SECONDS} seconds`}
            >
              <Rewind className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5 translate-x-0.5" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => skip(SKIP_SECONDS)}
              className={cn(iconBtn, 'h-9 w-9')}
              aria-label={`Skip forward ${SKIP_SECONDS} seconds`}
            >
              <FastForward className="h-4 w-4" aria-hidden />
            </button>
            {onNext && (
              <button type="button" onClick={onNext} className={cn(iconBtn, 'h-9 w-9')} aria-label="Next recording">
                <StepForward className="h-4 w-4" aria-hidden />
              </button>
            )}

            {/* Speed selector (item 6): a first-class labeled control that cycles the fixed set. */}
            <button
              type="button"
              onClick={() => cycleRatePref(1)}
              className="ml-1 min-w-[3rem] rounded-lg border border-border px-2 py-1.5 text-xs font-semibold tabular-nums text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Playback speed, ${formatRate(rate)}. Tap to change.`}
              title="Playback speed"
            >
              {formatRate(rate)}
            </button>

            {/* Volume — native range for keyboard + screen-reader support. */}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const el = mediaRef.current
                  if (el) el.muted = !el.muted
                }}
                className={cn(iconBtn, 'h-9 w-9')}
                aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const el = mediaRef.current
                  if (!el) return
                  const v = Number(e.target.value)
                  el.volume = v
                  el.muted = v === 0
                }}
                aria-label="Volume"
                className="hidden h-1 w-20 cursor-pointer accent-primary sm:block"
              />
            </div>
          </div>

          {/* Depth controls row. */}
          {(hasCaptions || hasChapters || transcript || downloadable) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {hasCaptions && (
                <button
                  type="button"
                  onClick={toggleCaptions}
                  aria-pressed={captionsOn}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    captionsOn ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:bg-surface-elevated',
                  )}
                >
                  <CaptionsIcon className="h-3.5 w-3.5" aria-hidden /> Captions
                </button>
              )}
              {hasChapters && (
                <button
                  type="button"
                  onClick={() => setChaptersOpen((v) => !v)}
                  aria-expanded={chaptersOpen}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ListMusic className="h-3.5 w-3.5" aria-hidden /> Chapters
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', chaptersOpen && 'rotate-180')} aria-hidden />
                </button>
              )}
              {transcript && (
                <button
                  type="button"
                  onClick={() => setTranscriptOpen((v) => !v)}
                  aria-expanded={transcriptOpen}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Transcript
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', transcriptOpen && 'rotate-180')} aria-hidden />
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Share"
                >
                  {copied ? <Link2 className="h-3.5 w-3.5" aria-hidden /> : <Share2 className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? 'Link copied' : 'Share'}
                </button>
                {downloadable && (
                  <a
                    href={src}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Chapters list — each seeks. */}
          {hasChapters && chaptersOpen && (
            <ul className="space-y-0.5 border-t border-border pt-2">
              {chapters!.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      seekTo(c.startSec)
                      if (!playing) play()
                    }}
                    aria-current={i === activeChapter ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-elevated',
                      i === activeChapter ? 'bg-primary-bg font-medium text-primary-strong' : 'text-text',
                    )}
                  >
                    <span className="shrink-0 tabular-nums text-2xs text-subtle">{formatTime(c.startSec)}</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Transcript — expandable, crawlable text. */}
          {transcript && transcriptOpen && (
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed text-muted">
              {transcript}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
