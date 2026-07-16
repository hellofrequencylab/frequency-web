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

const FADE_IN_SEC = 3 // the sit's opening fade-in (the owner ask: "fades in at the start")
const FADE_OUT_SEC = 1.5 // the close, and the duck floor on pause
const DUCK_SEC = 0.4 // pause: how fast it falls quiet
const LIFT_SEC = 0.6 // resume: how fast it comes back
const XFADE_SEC = 6 // the seam blend (clamped to 40% of the track for short clips)

/** The ambient gain at 100% volume. Raised well above the old fixed 0.4 so a member who wants
 *  the background louder can actually get there, while the top of the slider still sits under
 *  the bell + a speaking voice. The member's 0..1 volume scales this. */
export const AMBIENT_MAX_GAIN = 0.9

/** Fallback volume when a caller passes none (0..1). Mirrors lib/on-air DEFAULT_AMBIENT_VOLUME. */
const DEFAULT_VOLUME = 0.7

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME)

// Keep only the most recently decoded loop in memory — a decoded ambient track
// is large (tens of MB), and only one ever plays. The common path (audition a
// track, then start the sit on it) still hits the cache.
let cached: { url: string; buffer: AudioBuffer } | null = null

async function loadLoopBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  if (cached && cached.url === url) return cached.buffer
  const res = await fetch(url)
  const raw = await res.arrayBuffer()
  const decoded = await ctx.decodeAudioData(raw)
  const loop = buildSeamlessLoop(ctx, decoded)
  cached = { url, buffer: loop } // the decoded source falls out of scope and is GC'd
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

export interface AmbientOptions {
  /** Opening fade length. Defaults to the sit fade-in; previews pass a short one. */
  fadeInSec?: number
  /** If set, auto fade-out and stop this many seconds after playback begins.
   *  Used for the setup audition so nothing lingers into the sit. */
  autoStopAfterSec?: number
  /** Loudness as a 0..1 fraction of AMBIENT_MAX_GAIN. Defaults to DEFAULT_VOLUME. */
  volume?: number
}

/** Start an ambient loop on the given (already gesture-unlocked) context. Returns
 *  immediately; the buffer loads/decodes async and the fade-in begins once ready. */
export function createAmbient(ctx: AudioContext, url: string, opts: AmbientOptions = {}): AmbientHandle {
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  gain.connect(ctx.destination)

  let source: AudioBufferSourceNode | null = null
  let stopped = false
  // The member's chosen loudness → the effective playing gain. Held mutably so setVolume can
  // move it live, and so pause/resume know the level to fall from and lift back to. `paused`
  // keeps a live volume change from lifting a ducked (paused) loop back up.
  let target = clamp01(opts.volume ?? DEFAULT_VOLUME) * AMBIENT_MAX_GAIN
  let paused = false

  void loadLoopBuffer(ctx, url)
    .then((buffer) => {
      if (stopped) return
      source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(gain)
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
      target = clamp01(volume) * AMBIENT_MAX_GAIN
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
