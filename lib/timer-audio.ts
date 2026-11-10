// Timer audio — the shared Web Audio cue engine for the On Air sit, the Movement timer and the
// Mindless door's previews (WEBSITE-CHANGES-PLAN §4 C.6; normalized under LIVE-2246 from the
// Claude Design handoff's mindless-audio.js).
//
// No asset files: a soft bell is a short sine partial stack with a gentle attack (so there is no
// onset click) and a long exponential ring-out. Everything is wrapped so a flaky or suspended
// AudioContext never throws into the timer loop. Pure browser audio, no DOM, no React.
//
// Graph:  bells -> bell bus (+1.6) -> compressor -> limiter (-1 dBFS) -> out
//         ambient -> trim -> gain -> limiter -> out        (lib/on-air-ambient.ts)
//
// Normalization. Before this module every voice summed its partials at a fixed 0.08 peak, so the
// four-partial Bowl rang louder than the two-partial Soft, and a low voice read quieter to the ear
// than its meter said. Now every voice is scaled so its partial stack hits the same peak, then
// weighted for pitch (low voices get up to +3.5 dB), the bus compressor evens out the strike, and
// the limiter lets the bell run about 9 dB hotter than the old synth without clipping. Volumes are
// the member's 0..1 slider mapped through the perceptual curve (lib/on-air volumeCurve), so the
// middle of the slider sounds like the middle, not almost-full.

import { volumeCurve, type BellTone } from '@/lib/on-air'

/** The summed partial peak of one strike at full volume, before the bus. */
const BELL_PEAK = 0.55
/** The partial roll-off: each overtone sits at this fraction of the one below. */
const PARTIAL_STEP = 0.55
/** The bell bus gain into the compressor. */
const BUS_GAIN = 1.6
/** The reference fundamental: a voice this high gets no pitch weight; lower ones gain up to 1.5x. */
const PITCH_REF_HZ = 528
const PITCH_WEIGHT_MAX = 1.5

interface Bus {
  bells: GainNode
  limiter: DynamicsCompressorNode
}

// One bus per context (the door and an engine may hold different contexts), built on first use.
const buses = new WeakMap<AudioContext, Bus>()

/** The master limiter of a context: every sound reaches the speaker through it. */
export function limiterFor(ctx: AudioContext): DynamicsCompressorNode {
  return busFor(ctx).limiter
}

function busFor(ctx: AudioContext): Bus {
  const have = buses.get(ctx)
  if (have) return have
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.12
  limiter.connect(ctx.destination)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.004
  comp.release.value = 0.3
  comp.connect(limiter)
  const bells = ctx.createGain()
  bells.gain.value = BUS_GAIN
  bells.connect(comp)
  const bus = { bells, limiter }
  buses.set(ctx, bus)
  return bus
}

/** The per-partial peaks of one strike of a voice at full volume: the stack sums to BELL_PEAK,
 *  weighted up for a low fundamental. Pure, so the normalization is testable without audio. */
export function strikePeaks(tone: BellTone): number[] {
  const sum = tone.freqs.reduce((a, _, i) => a + Math.pow(PARTIAL_STEP, i), 0)
  const pitch = Math.min(PITCH_WEIGHT_MAX, Math.max(1, Math.pow(PITCH_REF_HZ / tone.freqs[0], 0.35)))
  const scale = (BELL_PEAK / sum) * pitch
  return tone.freqs.map((_, i) => Math.pow(PARTIAL_STEP, i) * scale)
}

// One sine partial: fade in over ~25ms, ring out exponentially. The soft attack is what keeps a
// synth ding from feeling harsh (the click is the onset). Into the bell bus, never the speaker.
function ding(ctx: AudioContext, at: number, freq: number, durationSec: number, peak: number, attackSec = 0.025) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), at + attackSec)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(gain)
  gain.connect(busFor(ctx).bells)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

// One strike of a voice at `at`: fundamental loudest, overtones progressively quieter + a touch
// shorter, for a warm bell/bowl body. `gain` is the curved volume (0..1).
function strikeAt(ctx: AudioContext, tone: BellTone, at: number, gain: number) {
  const peaks = strikePeaks(tone)
  tone.freqs.forEach((f, i) => {
    const dur = tone.decay * (i === 0 ? 1 : 0.8)
    ding(ctx, at, f, dur, peaks[i] * gain)
  })
}

/** One strike of the chosen voice at the member's 0..1 volume. The phase-change bell. */
export function chime(ctx: AudioContext | null, tone: BellTone, volume = 0.7) {
  if (!ctx) return
  const gain = volumeCurve(volume)
  if (!gain) return
  try {
    strikeAt(ctx, tone, ctx.currentTime, gain)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A gentle double strike to close the session, the second 0.55 s later and a touch softer. */
export function endChime(ctx: AudioContext | null, tone: BellTone, volume = 0.7) {
  if (!ctx) return
  const gain = volumeCurve(volume)
  if (!gain) return
  try {
    strikeAt(ctx, tone, ctx.currentTime, gain)
    strikeAt(ctx, tone, ctx.currentTime + 0.55, gain * 0.8)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A short, dry countdown blip — the 3-2-1 tick before a work phase. A single higher partial with
 *  a quick decay so it reads as a beat, not a bell. `accent` raises the pitch + length for the
 *  final "go" tick so the last beat lands. `volume` is the member's 0..1 slider. */
export function countBeep(ctx: AudioContext | null, volume = 0.7, accent = false) {
  if (!ctx) return
  const gain = volumeCurve(volume)
  if (!gain) return
  try {
    const at = ctx.currentTime
    const freq = accent ? 880 : 660
    const dur = accent ? 0.32 : 0.16
    ding(ctx, at, freq, dur, 0.28 * gain, 0.01)
  } catch {
    // the cue is a nicety, never a blocker
  }
}
