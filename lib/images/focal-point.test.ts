import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OBJECT_POSITION,
  clampPercent,
  objectPositionToXY,
  xyToObjectPosition,
  isDefaultObjectPosition,
  normalizeObjectPosition,
} from './focal-point'

describe('clampPercent', () => {
  it('bounds to 0–100 and rounds', () => {
    expect(clampPercent(-10)).toBe(0)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(30.4)).toBe(30)
    expect(clampPercent(30.6)).toBe(31)
  })
  it('falls back to center on non-finite input', () => {
    expect(clampPercent(Number.NaN)).toBe(50)
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(50)
  })
})

describe('objectPositionToXY', () => {
  it('parses a well-formed value', () => {
    expect(objectPositionToXY('50% 30%')).toEqual({ x: 50, y: 30 })
    expect(objectPositionToXY('0% 100%')).toEqual({ x: 0, y: 100 })
  })
  it('clamps out-of-range percentages', () => {
    expect(objectPositionToXY('-5% 120%')).toEqual({ x: 0, y: 100 })
  })
  it('falls back to center for garbage / empty / wrong shape', () => {
    expect(objectPositionToXY('')).toEqual({ x: 50, y: 50 })
    expect(objectPositionToXY(null)).toEqual({ x: 50, y: 50 })
    expect(objectPositionToXY('left top')).toEqual({ x: 50, y: 50 })
    expect(objectPositionToXY('50%')).toEqual({ x: 50, y: 50 })
    expect(objectPositionToXY('a% b%')).toEqual({ x: 50, y: 50 })
  })
})

describe('xyToObjectPosition', () => {
  it('formats a clean string and clamps', () => {
    expect(xyToObjectPosition(50, 30)).toBe('50% 30%')
    expect(xyToObjectPosition(-5, 130)).toBe('0% 100%')
  })
  it('round-trips through objectPositionToXY', () => {
    expect(objectPositionToXY(xyToObjectPosition(20, 80))).toEqual({ x: 20, y: 80 })
  })
})

describe('isDefaultObjectPosition', () => {
  it('treats empty and center as default', () => {
    expect(isDefaultObjectPosition('')).toBe(true)
    expect(isDefaultObjectPosition(null)).toBe(true)
    expect(isDefaultObjectPosition(DEFAULT_OBJECT_POSITION)).toBe(true)
    expect(isDefaultObjectPosition('50% 50%')).toBe(true)
  })
  it('treats a moved focal point as non-default', () => {
    expect(isDefaultObjectPosition('50% 30%')).toBe(false)
    expect(isDefaultObjectPosition('20% 50%')).toBe(false)
  })
})

describe('normalizeObjectPosition', () => {
  it('returns null for empty / default (nothing stored)', () => {
    expect(normalizeObjectPosition('')).toBeNull()
    expect(normalizeObjectPosition(null)).toBeNull()
    expect(normalizeObjectPosition('50% 50%')).toBeNull()
  })
  it('returns a clean string for a moved focal point', () => {
    expect(normalizeObjectPosition('50% 30%')).toBe('50% 30%')
    expect(normalizeObjectPosition('  20%   80%  ')).toBe('20% 80%')
    expect(normalizeObjectPosition('-5% 130%')).toBe('0% 100%')
  })
})
