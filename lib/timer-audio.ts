// Timer audio — the shared Web Audio cue engine for the On Air sit and the
// Movement timer (WEBSITE-CHANGES-PLAN §4 C.6). Factored out of the Mindless
// session (components/on-air/session.tsx) so the Movement session can reuse the
// exact same soft bell/bowl voice instead of re-rolling its own synth.
//
// No asset files: a soft bell is a short sine partial stack with a gentle attack
// (so there is no onset click) and a long exponential ring-out. Everything is
// wrapped so a flaky or suspended AudioContext never throws into the timer loop.
// Pure browser audio, no DOM, no React.

import type { BellTone } from '@/lib/on-air'

// One sine partial: fade in over ~25ms, ring out exponentially. The soft attack
// is what keeps a synth ding from feeling harsh (the click is the onset).
function ding(ctx: AudioContext, at: number, freq: number, durationSec: number, peak: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

// One strike of a voice at `at`: fundamental loudest, overtones progressively
// quieter + a touch shorter, for a warm bell/bowl body. `vol` scales the peak.
function strikeAt(ctx: AudioContext, tone: BellTone, at: number, vol = 1) {
  tone.freqs.forEach((f, i) => {
    const peak = 0.08 * Math.pow(0.55, i) * vol
    const dur = tone.decay * (i === 0 ? 1 : 0.8)
    ding(ctx, at, f, dur, peak)
  })
}

/** One strike of the chosen voice, at the given loudness. The phase-change bell. */
export function chime(ctx: AudioContext | null, tone: BellTone, vol = 1) {
  if (!ctx) return
  try {
    strikeAt(ctx, tone, ctx.currentTime, vol)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A gentle double strike to close the session, the second a touch softer. */
export function endChime(ctx: AudioContext | null, tone: BellTone, vol = 1) {
  if (!ctx) return
  try {
    strikeAt(ctx, tone, ctx.currentTime, vol)
    strikeAt(ctx, tone, ctx.currentTime + 0.55, vol)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A short, dry countdown blip — the 3-2-1 tick before a work phase. A single
 *  higher partial with a quick decay so it reads as a beat, not a bell. `accent`
 *  raises the pitch + length for the final "go" tick so the last beat lands. */
export function countBeep(ctx: AudioContext | null, vol = 1, accent = false) {
  if (!ctx) return
  try {
    const at = ctx.currentTime
    const freq = accent ? 880 : 660
    const dur = accent ? 0.32 : 0.16
    ding(ctx, at, freq, dur, 0.07 * vol)
  } catch {
    // the cue is a nicety, never a blocker
  }
}
