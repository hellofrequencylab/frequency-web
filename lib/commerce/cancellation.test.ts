import { describe, it, expect } from 'vitest'
import { computeBookingRefundCents } from './cancellation'

// PURE cancellation/no-show refund math (ADR-596, finding #4). No IO — network-free.
// Fixed clock so "within the window" vs "before the window" vs "past start" are deterministic.
const START = '2026-07-20T15:00:00.000Z' // the appointment start
const PAID = 10_000 // $100.00

describe('computeBookingRefundCents', () => {
  it('no policy set → full refund, zero fee', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-19T15:00:00.000Z', // a day before
    })
    expect(r).toEqual({ refundCents: PAID, feeCents: 0, reason: 'full' })
  })

  it('null window (fee set) → full refund', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T14:00:00.000Z', // 1h before
      cancellationWindowHours: null,
      noShowFeePct: 50,
    })
    expect(r.reason).toBe('full')
    expect(r.refundCents).toBe(PAID)
    expect(r.feeCents).toBe(0)
  })

  it('outside the window → full refund', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-18T15:00:00.000Z', // 48h before, window is 24h
      cancellationWindowHours: 24,
      noShowFeePct: 50,
    })
    expect(r).toEqual({ refundCents: PAID, feeCents: 0, reason: 'full' })
  })

  it('inside the window (before start) → late fee', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T05:00:00.000Z', // 10h before, window is 24h
      cancellationWindowHours: 24,
      noShowFeePct: 50,
    })
    expect(r).toEqual({ refundCents: 5_000, feeCents: 5_000, reason: 'late' })
  })

  it('exactly at the window boundary → late fee (inclusive)', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-19T15:00:00.000Z', // exactly 24h before
      cancellationWindowHours: 24,
      noShowFeePct: 40,
    })
    expect(r.reason).toBe('late')
    expect(r.feeCents).toBe(4_000)
    expect(r.refundCents).toBe(6_000)
  })

  it('at/after start → no-show fee', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T15:30:00.000Z', // 30m after start
      cancellationWindowHours: 24,
      noShowFeePct: 50,
    })
    expect(r).toEqual({ refundCents: 5_000, feeCents: 5_000, reason: 'noshow' })
  })

  it('exactly at start → no-show', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: START,
      cancellationWindowHours: 24,
      noShowFeePct: 100,
    })
    expect(r.reason).toBe('noshow')
  })

  it('0% fee inside the window → full refund', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T14:00:00.000Z',
      cancellationWindowHours: 24,
      noShowFeePct: 0,
    })
    expect(r).toEqual({ refundCents: PAID, feeCents: 0, reason: 'full' })
  })

  it('100% fee no-show → zero refund, full fee', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T16:00:00.000Z',
      cancellationWindowHours: 24,
      noShowFeePct: 100,
    })
    expect(r).toEqual({ refundCents: 0, feeCents: PAID, reason: 'noshow' })
  })

  it('clamps a >100% fee to the paid amount (never negative refund)', () => {
    const r = computeBookingRefundCents({
      paidCents: PAID,
      startsAt: START,
      now: '2026-07-20T16:00:00.000Z',
      cancellationWindowHours: 24,
      noShowFeePct: 150,
    })
    expect(r.feeCents).toBe(PAID)
    expect(r.refundCents).toBe(0)
    expect(r.reason).toBe('noshow')
  })

  it('rounds the fee to the nearest cent', () => {
    const r = computeBookingRefundCents({
      paidCents: 999, // $9.99
      startsAt: START,
      now: '2026-07-20T14:00:00.000Z',
      cancellationWindowHours: 24,
      noShowFeePct: 33, // 329.67 → 330
    })
    expect(r.feeCents).toBe(330)
    expect(r.refundCents).toBe(669)
    expect(r.reason).toBe('late')
  })

  it('coerces a non-integer paidCents and degrades a bad date to full', () => {
    const bad = computeBookingRefundCents({
      paidCents: 5_000.7,
      startsAt: 'not-a-date',
      now: START,
      cancellationWindowHours: 24,
      noShowFeePct: 50,
    })
    expect(bad).toEqual({ refundCents: 5_001, feeCents: 0, reason: 'full' })
  })
})
