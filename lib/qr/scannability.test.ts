import { describe, it, expect } from 'vitest'
import { contrastRatio, scannabilityWarnings } from './scannability'
import { DEFAULT_STYLE, type QrStyle } from './style'

describe('contrastRatio', () => {
  it('is maximal for black on white and minimal for same colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 5)
  })
})

describe('scannabilityWarnings', () => {
  it('passes a classic dark-on-white code', () => {
    expect(scannabilityWarnings(DEFAULT_STYLE)).toEqual([])
  })

  it('flags low contrast', () => {
    const s: QrStyle = { ...DEFAULT_STYLE, fg: '#bbbbbb', bg: '#ffffff' }
    expect(scannabilityWarnings(s).some((w) => w.toLowerCase().includes('contrast'))).toBe(true)
  })

  it('flags an inverted (light-on-dark) code', () => {
    const s: QrStyle = { ...DEFAULT_STYLE, fg: '#ffffff', bg: '#0b0b0c' }
    expect(scannabilityWarnings(s).some((w) => w.toLowerCase().includes('dark background'))).toBe(true)
  })

  it('flags too-small a quiet zone', () => {
    const s: QrStyle = { ...DEFAULT_STYLE, margin: 1 }
    expect(scannabilityWarnings(s).some((w) => w.toLowerCase().includes('quiet-zone'))).toBe(true)
  })

  it('uses the worst gradient stop for contrast', () => {
    // A pale "from" stop against white should trip the contrast warning.
    const s: QrStyle = { ...DEFAULT_STYLE, gradient: { from: '#eeeeee', to: '#111111', angle: 45 } }
    expect(scannabilityWarnings(s).some((w) => w.toLowerCase().includes('contrast'))).toBe(true)
  })
})
