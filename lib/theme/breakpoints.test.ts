import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BREAKPOINTS, breakpointFor } from './breakpoints'

describe('shared breakpoints', () => {
  it('are 600, 840, 1200 and 1600', () => {
    expect(BREAKPOINTS).toEqual({ sm: 600, md: 840, lg: 1200, xl: 1600 })
  })
  it('resolve a width to the widest step reached', () => {
    expect([390, 599, 600, 839, 840, 1199, 1200, 1599, 1600, 2000].map(breakpointFor)).toEqual(['xs', 'xs', 'sm', 'sm', 'md', 'md', 'lg', 'lg', 'xl', 'xl'])
  })
})

describe('builder shape and editor tokens', () => {
  const css = readFileSync('app/themes/frequency/editor-shell.css', 'utf8')
  it('declares the five radius steps, the pill and the four roles', () => {
    for (const d of ['--r-1: 10px', '--r-2: 14px', '--r-3: 18px', '--r-4: 24px', '--r-5: 32px', '--r-pill:', '--r-control:', '--r-card:', '--r-panel:', '--r-media:']) expect(css).toContain(d)
  })
  it('builds the editor tokens from room tokens, so night follows with no literal and no filter', () => {
    for (const n of ['--editor-canvas', '--editor-thumb', '--editor-ring', '--editor-select']) expect(css).toMatch(new RegExp(`${n}: var\\(--fq-`))
  })
})
