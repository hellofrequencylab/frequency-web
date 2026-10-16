import { describe, expect, it } from 'vitest'
import { frequencyAccentVars } from './accent'

// SCAN-962: under the Frequency design a Space's own accent paints its buttons, active tab and highlights.
describe('the Frequency accent', () => {
  it('keeps the design fill when the Space picked no accent', () => {
    expect(frequencyAccentVars(null)).toBeNull()
    expect(frequencyAccentVars('')).toBeNull()
    expect(frequencyAccentVars('not-a-color')).toBeNull()
  })

  it('paints a picked hex with the label that reads best on it', () => {
    // The Group's website yellow keeps dark text, as its website draws it.
    expect(frequencyAccentVars('#E9B949')).toMatchObject({ '--space-accent': '#E9B949', '--space-accent-on': '#1E1B18' })
    // A deep purple gets white.
    expect(frequencyAccentVars('#872cc3')).toMatchObject({ '--space-accent': '#872cc3', '--space-accent-on': '#ffffff' })
    expect(frequencyAccentVars('#E9B949')?.['--space-accent-strong']).toMatch(/^light-dark\(/)
  })
})
