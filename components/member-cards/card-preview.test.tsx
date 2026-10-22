import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardPreview } from './card-preview'

// LIVE-1282: the drawn member card. The printed number, the edition (Founders is 1 to 100) and the
// stage are the card's whole identity, so they are locked here.

describe('CardPreview', () => {
  it('prints the wordmark, the Founders edition, the name and "No. 0042 · Regular"', () => {
    const html = renderToStaticMarkup(<CardPreview name="Ada Lane" cardNumber={42} stageLabel="Regular" />)
    expect(html).toContain('Frequency')
    expect(html).toContain('Founders')
    expect(html).toContain('Ada Lane')
    expect(html).toContain('No. 0042 · Regular')
  })

  it('is a Crew card past number 100, and says so when no card is written yet', () => {
    expect(renderToStaticMarkup(<CardPreview name="Ada" cardNumber={101} />)).toContain('Crew')
    expect(renderToStaticMarkup(<CardPreview name="Ada" cardNumber={null} />)).toContain('Not written yet')
  })

  it('marks a paused card in sight and for a screen reader', () => {
    const html = renderToStaticMarkup(<CardPreview name="Ada" cardNumber={7} paused />)
    expect(html).toContain('Paused')
    expect(html).toMatch(/aria-label="[^"]*, paused"/)
  })

  it('paints with tokens only, never a hex colour', () => {
    const html = renderToStaticMarkup(<CardPreview name="Ada" cardNumber={7} stageLabel="Anchor" />)
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(html).toContain('var(--color-ink)')
  })
})
