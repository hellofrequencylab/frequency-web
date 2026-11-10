// On Air — ambient background loop (client, Web Audio). Plays one of the
// AMBIENT_TRACKS as a SEAMLESS loop with a gentle fade-in for the duration of a
// sit (ADR-229, docs/ON-AIR.md). Optional; default off.
//
// Why not just <audio loop>? A plain loop clicks at the seam: MP3 carries
// encoder padding (a few ms of silence) at the ends, and the track's last sample
// rarely lines up with its first, so every wrap pops. Instead we decode the file
// once, build a crossfade-to-self loop buffer (the tail blended back over the
// head so the end and the start land on the same audio), and loop THAT on an
// AudioBufferSourceNode — sample-accurate, gapless, no pop.
//
// Volume rides a GainNode: start fades in from silence, pause ducks to quiet,
// resume lifts it back, and the end fades out. Every call is wrapped — like the
// bell, the ambience is a nicety, never a blocker.
//
// Loudness (LIVE-2246). The three tracks were mastered at different levels, so one slider
// position used to mean three loudnesses. Now each decoded track is measured once (a gated RMS
// over 50 ms blocks, plus its sample peak) and a per-track trim pulls it to a common -20 dBFS
// target, clamped so a near-silent or hot file cannot run away. The member's 0..1 slider then
// rides the same perceptual curve as the bell (lib/on-air volumeCurve), and the loop reaches the
// speaker through the shared master limiter (lib/timer-audio), never the destination directly.

import { volumeCurve } from '@/lib/on-air'
import { limiterFor } from '@/lib/timer-audio'

const FADE_IN_SEC = 3 // the sit's opening fade-in (the owner ask: "fades in at the start")
const FADE_OUT_SEC = 1.5 // the close, and the duck floor on pause
const DUCK_SEC = 0.4 // pause: how fast it falls quiet
const LIFT_SEC = 0.6 // resume: how fast it comes back
const XFADE_SEC = 6 // the seam blend (clamped to 40% of the track for short clips)

/** Fallback volume when a caller passes none (0..1). Mirrors lib/on-air DEFAULT_AMBIENT_VOLUME. */
const DEFAULT_VOLUME = 0.7

/** The common loudness every track is trimmed toward, in dBFS (gated RMS). */
const TARGET_RMS_DB = -20
/** The trim range: a quiet file gains at most this, a hot one loses at most this. */
const TRIM_MIN_DB = -12
const TRIM_MAX_DB = 18
/** The RMS gate: 50 ms blocks under this level (silence, fades) do not count toward the average. */
const GATE_DB = -50
const BLOCK_SEC = 0.05

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME)

const dbToGain = (db: number) => Math.pow(10, db / 20)
const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)

/** What one decoded track measures as: its gated RMS and sample peak in dBFS, and the trim (in
 *  dB) that brings it to the common target. Pure, so the normalization is testable on arrays. */
interface TrackLevels {
  rmsDb: number
  peakDb: number
  trimDb: number
}

/** Measure a track's loudness from its channel data. Blocks of `blockSec` quieter than the gate
 *  are ignored so a long fade or a silent head does not drag the average down; a track with no
 *  block above the gate reads as silence and gets the minimum trim, never a huge boost. */
export function measureTrack(channels: Float32Array[], sampleRate: number, blockSec = BLOCK_SEC): TrackLevels {
  const block = Math.max(1, Math.floor(sampleRate * blockSec))
  const n = channels[0]?.length ?? 0
  let peak = 0
  let sumSq = 0
  let counted = 0
  for (let start = 0; start < n; start += block) {
    const end = Math.min(n, start + block)
    let blockSq = 0
    let blockN = 0
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const v = data[i]
        const a = Math.abs(v)
        if (a > peak) peak = a
        blockSq += v * v
        blockN++
      }
    }
    if (!blockN) continue
    const blockDb = gainToDb(Math.sqrt(blockSq / blockN))
    if (blockDb < GATE_DB) continue
    sumSq += blockSq
    counted += blockN
  }
  const rmsDb = counted ? gainToDb(Math.sqrt(sumSq / counted)) : -Infinity
  const peakDb = gainToDb(peak)
  const trimDb = Number.isFinite(rmsDb) ? Math.min(TRIM_MAX_DB, Math.max(TRIM_MIN_DB, TARGET_RMS_DB - rmsDb)) : TRIM_MIN_DB
  return { rmsDb, peakDb, trimDb }
}

/** The linear trim gain for a measured track. */
export function trimGain(levels: TrackLevels): number {
  return dbToGain(levels.trimDb)
}

interface LoadedLoop {
  buffer: AudioBuffer
  trim: number
}

// Keep only the most recently decoded loop in memory — a decoded ambient track
// is large (tens of MB), and only one ever plays. The common path (audition a
// track, then start the sit on it) still hits the cache, trim included.
let cached: { url: string; loop: LoadedLoop } | null = null

async function loadLoopBuffer(ctx: AudioContext, url: string): Promise<LoadedLoop> {
  if (cached && cached.url === url) return cached.loop
  const res = await fetch(url)
  const raw = await res.arrayBuffer()
  const decoded = await ctx.decodeAudioData(raw)
  const channels: Float32Array[] = []
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch))
  const trim = trimGain(measureTrack(channels, decoded.sampleRate))
  const loop = { buffer: buildSeamlessLoop(ctx, decoded), trim }
  cached = { url, loop } // the decoded source falls out of scope and is GC'd
  return loop
}

/** Crossfade the tail back over the head so the buffer loops with no seam.
 *  Output = a `xfade`-shorter buffer whose first `xfade` seconds blend the old
 *  tail (fading out) into the old head (fading in); the wrap point then lands on
 *  the same audio on both sides, so `loop = true` is gapless. Pure array math. */
function buildSeamlessLoop(ctx: AudioContext, src: AudioBuffer): AudioBuffer {
  const sr = src.sampleRate
  const n = src.length
  const x = Math.min(Math.floor(XFADE_SEC * sr), Math.floor(n * 0.4))
  if (x <= 0 || n - x <= x) return src // too short to crossfade — loop it as-is
  const out = ctx.createBuffer(src.numberOfChannels, n - x, sr)
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const inD = src.getChannelData(ch)
    const outD = out.getChannelData(ch)
    // seam [0, x): tail fading out, head fading in (linear — the material is
    // correlated, so a constant-sum crossfade holds the level).
    for (let i = 0; i < x; i++) {
      const f = i / x
      outD[i] = inD[n - x + i] * (1 - f) + inD[i] * f
    }
    // body [x, n - x): the untouched middle.
    for (let i = x; i < n - x; i++) outD[i] = inD[i]
  }
  return out
}

export interface AmbientHandle {
  /** Duck to silence (member tapped Pause). */
  pause(): void
  /** Lift back to the soft background level (resume). */
  resume(): void
  /** Live-set the loudness (0..1) while playing — the setup volume slider rides this so a
   *  member hears the change on the audition without restarting the loop. */
  setVolume(volume: number): void
  /** Fade out and stop for good. */
  stop(): void
}

interface AmbientOptions {
  /** Opening fade length. Defaults to the sit fade-in; previews pass a short one. */
  fadeInSec?: number
  /** If set, auto fade-out and stop this many seconds after playback begins.
   *  Used for the setup audition so nothing lingers into the sit. */
  autoStopAfterSec?: number
  /** Loudness as the member's 0..1 slider, through the perceptual curve. Defaults to DEFAULT_VOLUME. */
  volume?: number
}

/** Start an ambient loop on the given (already gesture-unlocked) context. Returns
 *  immediately; the buffer loads/decodes async and the fade-in begins once ready. */
export function createAmbient(ctx: AudioContext, url: string, opts: AmbientOptions = {}): AmbientHandle {
  // source -> trim (the per-track loudness match) -> gain (the member's volume, faded) -> limiter
  const trimNode = ctx.createGain()
  trimNode.gain.value = 1
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  trimNode.connect(gain)
  try {
    gain.connect(limiterFor(ctx))
  } catch {
    gain.connect(ctx.destination)
  }

  let source: AudioBufferSourceNode | null = null
  let stopped = false
  // The member's chosen loudness → the effective playing gain. Held mutably so setVolume can
  // move it live, and so pause/resume know the level to fall from and lift back to. `paused`
  // keeps a live volume change from lifting a ducked (paused) loop back up.
  let target = volumeCurve(clamp01(opts.volume ?? DEFAULT_VOLUME))
  let paused = false

  void loadLoopBuffer(ctx, url)
    .then(({ buffer, trim }) => {
      if (stopped) return
      trimNode.gain.value = trim
      source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(trimNode)
      source.start()

      const t0 = ctx.currentTime
      const fadeIn = opts.fadeInSec ?? FADE_IN_SEC
      const g = gain.gain
      g.cancelScheduledValues(t0)
      g.setValueAtTime(0.0001, t0)
      g.linearRampToValueAtTime(target, t0 + fadeIn)

      if (opts.autoStopAfterSec != null) {
        const stopAt = t0 + Math.max(opts.autoStopAfterSec, fadeIn)
        g.setValueAtTime(target, stopAt)
        g.linearRampToValueAtTime(0.0001, stopAt + FADE_OUT_SEC)
        try {
          source.stop(stopAt + FADE_OUT_SEC + 0.05)
        } catch {
          // already scheduled/stopped
        }
      }
    })
    .catch(() => {
      // a missing/undecodable file just means no ambience — never block the sit
    })

  const rampTo = (value: number, seconds: number) => {
    try {
      const now = ctx.currentTime
      const g = gain.gain
      g.cancelScheduledValues(now)
      g.setValueAtTime(Math.max(0.0001, g.value), now)
      g.linearRampToValueAtTime(Math.max(0.0001, value), now + seconds)
    } catch {
      // a flaky context never throws into the timer
    }
  }

  return {
    pause() {
      paused = true
      rampTo(0.0001, DUCK_SEC)
    },
    resume() {
      paused = false
      rampTo(target, LIFT_SEC)
    },
    setVolume(volume: number) {
      target = volumeCurve(clamp01(volume))
      // Only move the audible level when actually playing — a paused loop stays ducked and
      // lifts to the NEW target on resume. A short ramp so a slider drag reads as smooth.
      if (!paused && !stopped) rampTo(target, 0.15)
    },
    stop() {
      stopped = true
      rampTo(0.0001, FADE_OUT_SEC)
      try {
        source?.stop(ctx.currentTime + FADE_OUT_SEC + 0.05)
      } catch {
        // not started yet, or already stopped
      }
    },
  }
}
