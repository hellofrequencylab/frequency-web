// LIVE-2246: the timer audio normalization is pure where it matters, so it is pinned here
// without an AudioContext. The bell stack sums to one peak whatever the voice, low voices get a
// bounded pitch weight, the volume curve is perceptual, and the ambient trim pulls every track
// to one target without running away on silence.
import { describe, expect, it } from 'vitest'
import { BELL_TONES, bellToneBySlug, volumeCurve } from '@/lib/on-air'
import { strikePeaks } from '@/lib/timer-audio'
import { measureTrack, trimGain } from '@/lib/on-air-ambient'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('strikePeaks', () => {
  it('sums every voice to the same peak before the pitch weight', () => {
    const peaks = BELL_TONES.map((t) => {
      const ps = strikePeaks(t)
      const pitch = Math.min(1.5, Math.max(1, Math.pow(528 / t.freqs[0], 0.35)))
      return sum(ps) / pitch
    })
    for (const p of peaks) expect(p).toBeCloseTo(peaks[0], 6)
    expect(peaks[0]).toBeCloseTo(0.55, 6)
  })

  it('rolls the overtones off from the fundamental', () => {
    const ps = strikePeaks(bellToneBySlug('bowl'))
    expect(ps.length).toBe(bellToneBySlug('bowl').freqs.length)
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThan(ps[i - 1])
  })

  it('weights a low voice up, never more than 1.5x, and a high voice not at all', () => {
    const low = strikePeaks({ slug: 'x', name: 'x', freqs: [110], decay: 2 })
    const high = strikePeaks({ slug: 'y', name: 'y', freqs: [1056], decay: 2 })
    expect(sum(low)).toBeCloseTo(0.55 * 1.5, 6)
    expect(sum(high)).toBeCloseTo(0.55, 6)
  })
})

describe('volumeCurve', () => {
  it('is silent at 0, unity at 1 and -20 dB in the middle', () => {
    expect(volumeCurve(0)).toBe(0)
    expect(volumeCurve(1)).toBeCloseTo(1, 9)
    expect(volumeCurve(0.5)).toBeCloseTo(0.1, 9)
  })
  it('is monotonic and keeps the legacy presets in order', () => {
    let last = -1
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const g = volumeCurve(v)
      expect(g).toBeGreaterThanOrEqual(last)
      last = g
    }
    expect(volumeCurve('quiet')).toBeLessThan(volumeCurve('medium'))
    expect(volumeCurve('medium')).toBeLessThan(volumeCurve('loud'))
    expect(volumeCurve(undefined)).toBeCloseTo(volumeCurve(0.7), 9)
  })
})

describe('ambient trim', () => {
  const sine = (amp: number, seconds: number, sr = 8000) => {
    const out = new Float32Array(Math.floor(seconds * sr))
    for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / sr)
    return out
  }
  it('pulls a quiet and a hot track to the same target', () => {
    const quiet = measureTrack([sine(0.05, 1)], 8000)
    const hot = measureTrack([sine(0.5, 1)], 8000)
    const level = (m: ReturnType<typeof measureTrack>) => m.rmsDb + m.trimDb
    expect(level(quiet)).toBeCloseTo(-20, 1)
    expect(level(hot)).toBeCloseTo(-20, 1)
    expect(trimGain(quiet)).toBeGreaterThan(1)
    expect(trimGain(hot)).toBeLessThan(1)
    expect(hot.peakDb).toBeCloseTo(20 * Math.log10(0.5), 1)
  })
  it('clamps the trim to -12..+18 dB', () => {
    expect(measureTrack([sine(0.01, 1)], 8000).trimDb).toBe(18)
    expect(measureTrack([sine(1, 1)], 8000).trimDb).toBe(-12)
  })
  it('ignores silence when averaging, and never boosts a silent track past the clamp', () => {
    const half = new Float32Array(16000)
    half.set(sine(0.1, 1), 0) // one second of tone, one second of silence
    const gated = measureTrack([half], 8000)
    const tone = measureTrack([sine(0.1, 1)], 8000)
    expect(gated.rmsDb).toBeCloseTo(tone.rmsDb, 1)
    const silent = measureTrack([new Float32Array(8000)], 8000)
    expect(silent.rmsDb).toBe(-Infinity)
    expect(silent.trimDb).toBe(-12)
  })
})
