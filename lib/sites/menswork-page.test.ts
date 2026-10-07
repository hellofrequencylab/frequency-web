import { describe, expect, it } from 'vitest'
import {
  dateLabel,
  headlineSegments,
  imageFocus,
  isBeatStrip,
  plainText,
  lines,
  mdOf,
  moduleLine,
  planMensworkPage,
  seasonAt,
  seasonNamed,
  signAt,
} from './menswork-page'

describe('signs and seasons', () => {
  it('wraps Capricorn across the new year', () => {
    expect(signAt(1221).id).toBe(signAt(110).id)
    expect(signAt(1221).name).toBe('Capricorn')
    expect(signAt(119).name).toBe('Aquarius')
    expect(signAt(1007).name).toBe('Libra')
  })
  it('reads a season from a date and from a title', () => {
    expect(seasonAt(mdOf('2027-01-05T18:00:00+00:00')!)).toBe('winter')
    expect(seasonAt(mdOf('2027-10-29')!)).toBe('fall')
    expect(seasonNamed('Spring.')).toBe('spring')
    expect(seasonNamed('Desert Retreat')).toBeNull()
  })
  it('parses a module line by sign name', () => {
    expect(moduleLine('Libra: partnership, conflict, repair')).toMatchObject({ sign: { name: 'Libra' }, theme: 'partnership, conflict, repair' })
    expect(moduleLine('Not a sign: x')).toBeNull()
  })
})

describe('text helpers', () => {
  it('splits a crop focus off a photo url', () => {
    expect(imageFocus('https://x.test/a.jpg?pos=58-60')).toEqual({ src: 'https://x.test/a.jpg', position: '58% 60%' })
    expect(imageFocus('https://x.test/a.jpg').position).toBeNull()
    expect(imageFocus(null).src).toBeNull()
  })
  it('marks the accent word, or *marked* text', () => {
    expect(headlineSegments('Find your circle.', 'circle')).toEqual([
      { text: 'Find your ', accent: false },
      { text: 'circle', accent: true },
      { text: '.', accent: false },
    ])
    expect(headlineSegments('Come *first*', '')).toEqual([
      { text: 'Come ', accent: false },
      { text: 'first', accent: true },
    ])
    expect(headlineSegments('Plain', 'missing')).toEqual([{ text: 'Plain', accent: false }])
  })
  it('reads lines and wall-clock dates', () => {
    expect(lines('a\n\n<b>b</b><br/>c')).toEqual(['a', 'b', 'c'])
    expect(plainText(' <p>Hi <b>there</b></p> ')).toBe('Hi there')
    expect(plainText('a > b <<script>c')).toBe('a  b c')
    expect(dateLabel('2027-03-09T18:00:00+00:00')).toEqual({ day: 'Tue Mar 9', time: '6:00 PM' })
    expect(dateLabel('2027-03-09').time).toBeNull()
  })
  it('knows a beat strip by its single-letter icons', () => {
    expect(isBeatStrip(['P', 'U', 'L', 'S', 'E'].map((icon) => ({ icon })))).toBe(true)
    expect(isBeatStrip([{ icon: 'Flame' }, { icon: 'Users' }])).toBe(false)
  })
})

describe('planMensworkPage', () => {
  it('folds a run of season sections into one year and keeps other blocks in order', () => {
    const zig = (title: string) => ({ type: 'Zigzag', props: { title } })
    const plan = planMensworkPage([
      { type: 'PhotoHero', props: { title: 'The year' } },
      zig('Winter'),
      zig('Spring'),
      zig('Summer'),
      zig('Fall'),
      { type: 'SpaceEvents', props: {} },
      { type: 'SomethingNew', props: {} },
    ])
    expect(plan.map((p) => p.kind)).toEqual(['hero', 'year', 'events', 'other'])
    expect(plan[1]).toEqual({ kind: 'year', at: [1, 2, 3, 4] })
  })
})
