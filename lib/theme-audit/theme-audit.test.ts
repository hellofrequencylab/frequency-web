import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOLE_BELOW, classesOf, compareToBaseline, coverageOf, holeId, selectorClasses } from './coverage'
import { realContentProps } from './fixture'

describe('real-content fixture', () => {
  const comp = {
    defaultProps: { heading: '', items: [], tone: 'ink' },
    fields: {
      heading: { type: 'text' },
      body: { type: 'textarea' },
      tone: { type: 'select', options: [{ value: 'surface' }, { value: 'ink' }] },
      align: { type: 'radio', options: [{ value: 'left' }] },
      image: { type: 'custom' },
      items: { type: 'array', arrayFields: { label: { type: 'text' }, href: { type: 'text' } } },
    },
  }

  it('fills empty fields and keeps what the block already ships', () => {
    const p = realContentProps(comp, 'b-1') as Record<string, any>
    expect(p.heading).toMatch(/\S/)
    expect(p.body.length).toBeGreaterThan(20)
    expect(p.tone).toBe('ink')
    expect(p.align).toBe('left')
    expect(p.image).toMatch(/^data:image\/svg/)
    expect(p.items).toHaveLength(3)
    expect(p.items[0].href).toBe('/')
    expect(p.id).toBe('b-1')
  })

  it('is deterministic', () => {
    expect(realContentProps(comp, 'x')).toEqual(realContentProps(comp, 'x'))
  })
})

describe('coverage', () => {
  it('reads selector classes and ignores comments, strings and urls', () => {
    const css = `/* .gone */ .a-b:hover, .c > .d{background:url("x.svg");content:".nope";margin:0.5rem}`
    expect([...selectorClasses(css)].sort()).toEqual(['a-b', 'c', 'd'])
  })

  it('scores the share of themed classes a theme styles', () => {
    const themed = new Set(['a', 'b', 'c', 'd'])
    expect(coverageOf(classesOf('<p class="a b tw-x"><i class="c"></i></p>'), themed, new Set(['a', 'c']))).toBe(0.67)
    expect(coverageOf(['tw-x'], themed, new Set())).toBeNull()
  })

  it('lists added and fixed holes against a baseline', () => {
    expect(compareToBaseline(['A@x', 'B@x'], ['B@x', holeId('C', 'y')])).toEqual({ added: ['C@y'], fixed: ['A@x'] })
  })
})

describe('hole baseline', () => {
  const file = JSON.parse(readFileSync('docs/theme-cohesion-baseline.json', 'utf8')) as { holeBelow: number; holes: string[] }

  it('records the bar it was measured at and a sorted list of unique holes', () => {
    expect(file.holeBelow).toBe(HOLE_BELOW)
    expect(file.holes.length).toBeGreaterThan(0)
    expect(file.holes).toEqual([...new Set(file.holes)].sort())
    expect(file.holes.every((h) => /^[A-Za-z0-9]+@[a-z-]+$/.test(h))).toBe(true)
  })
})
