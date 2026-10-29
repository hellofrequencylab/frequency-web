import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { FREQUENCY_SHEETS, resolveFrequencyTokens } from '../../scripts/lib/contrast-frequency.mjs'
import { contrastRatio, parseColor } from '../../scripts/check-contrast.mjs'

const sheets = FREQUENCY_SHEETS.map((p: string) => readFileSync(p, 'utf8'))
const root = { root: true, classes: [] as string[], attrs: { 'data-design': 'frequency' } }
const skin = { classes: [], attrs: { 'data-skin': 'default' } }

it('keeps small accent text readable after the member skin rebinds aliases', () => {
  const tokens = resolveFrequencyTokens(sheets, { chain: [root, skin] })
  const fg = parseColor(tokens.get('--color-primary-strong'))!
  // Actual axe backgrounds: offer bar, translucent primary chip, and manage page.
  for (const bg of ['#ecf6f6', '#dae2e2', '#ffffff']) {
    expect(contrastRatio(fg, parseColor(bg)!), bg).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(parseColor('#3a8c99')!, parseColor(bg)!), 'old fill accent fails as text').toBeLessThan(4.5)
  }
})

it('preserves the night and Stage accent when a member skin is present', () => {
  const dark = { ...root, classes: ['dark'] }
  const stage = { classes: [], attrs: { 'data-surface': 'stage' } }
  for (const chain of [[dark, skin], [root, stage], [root, stage, skin]]) {
    const tokens = resolveFrequencyTokens(sheets, { chain })
    expect(tokens.get('--color-primary-strong')).toBe(tokens.get('--fq-accent'))
  }
})
