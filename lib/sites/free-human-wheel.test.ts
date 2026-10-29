import { describe, expect, it } from 'vitest'
import { FREE_HUMAN_WHEEL_YEARS, freeHumanWheelMonth, freeHumanWheelStops, freeHumanWheelYear } from './free-human-wheel'

const ALL = { sun: true, seasons: true, full: true, new: true, eclipses: true, retro: true, ours: true }

describe('the year wheel sky', () => {
  it('covers each year it has tables for', () => {
    expect([...FREE_HUMAN_WHEEL_YEARS]).toEqual([2026, 2027, 2028])
    expect(freeHumanWheelYear(2028).n).toBe(366)
    expect(freeHumanWheelYear(2027).n).toBe(365)
  })
  it('turns the sun through all twelve signs and puts the four turns on the right days', () => {
    const Y = freeHumanWheelYear(2026)
    expect(new Set(Y.days.map((d) => d.sign)).size).toBe(12)
    const turns = Y.ev.filter((e) => e.kind === 'season').map((e) => Date.UTC(2026, Y.days[e.i].m, Y.days[e.i].d))
    const expected = [Date.UTC(2026, 2, 20), Date.UTC(2026, 5, 21), Date.UTC(2026, 8, 23), Date.UTC(2026, 11, 21)]
    expect(turns).toHaveLength(4)
    turns.forEach((t, i) => expect(Math.abs(t - expected[i])).toBeLessThanOrEqual(86_400_000))
  })
  it('finds about thirteen moons of each kind, the eclipses and the retrograde arcs it was given', () => {
    const Y = freeHumanWheelYear(2026)
    const count = (k: string) => Y.ev.filter((e) => e.kind === k).length
    expect(count('full') + Y.ev.filter((e) => e.kind === 'eclipse' && e.sub.startsWith('Full')).length).toBeGreaterThanOrEqual(12)
    expect(count('new') + Y.ev.filter((e) => e.kind === 'eclipse' && e.sub.startsWith('New')).length).toBeGreaterThanOrEqual(12)
    expect(count('eclipse')).toBe(4)
    expect(Y.arcs).toHaveLength(3)
    expect(count('retro')).toBe(3)
    expect(count('direct')).toBe(3)
  })
  it('names a blue moon when a month has two', () => {
    const names = freeHumanWheelYear(2026).ev.filter((e) => e.kind === 'full').map((e) => e.sub)
    expect(names.every((n) => /Moon$/.test(n))).toBe(true)
  })
  it('lays the sign arcs end to end around the circle', () => {
    const { segs } = freeHumanWheelYear(2027)
    for (let i = 1; i < segs.length; i++) expect(segs[i].a0).toBeCloseTo(segs[i - 1].a1, 5)
    expect(segs.reduce((n, s) => n + (s.a1 - s.a0), 0)).toBeCloseTo(360, 5)
  })
})

describe('the stops', () => {
  const Y = freeHumanWheelYear(2026)
  it('adds the Space gatherings of that year only, first at their day', () => {
    const { stops } = freeHumanWheelStops(Y, [{ date: '2026-03-05', title: 'Circle' }, { date: '2027-03-05', title: 'Next year' }], ALL)
    const ours = stops.flatMap((s) => s.items).filter((e) => e.kind === 'gathering')
    expect(ours.map((e) => e.title)).toEqual(['Circle'])
    expect(Y.days[ours[0].i]).toMatchObject({ m: 2, d: 5 })
    const stop = stops.find((s) => s.i === ours[0].i)!
    expect(stop.items[0].kind).toBe('gathering')
  })
  it('drops a layer that is switched off and keeps stops in day order', () => {
    const { stops, evs } = freeHumanWheelStops(Y, [], { ...ALL, full: false, new: false })
    expect(evs.some((e) => e.kind === 'full' || e.kind === 'new')).toBe(false)
    expect(stops.map((s) => s.i)).toEqual([...stops.map((s) => s.i)].sort((a, b) => a - b))
  })
  it('writes a month as a stop of its own', () => {
    const { evs } = freeHumanWheelStops(Y, [], ALL)
    const m = freeHumanWheelMonth(Y, evs, 2)
    expect(m).toMatchObject({ kind: 'month', title: 'March', i: Y.monthStart[2] })
    expect(m.sub).toMatch(/^Sun in /)
    expect(m.text.length).toBeGreaterThan(10)
  })
})
