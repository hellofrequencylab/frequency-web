import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { spacesComponents } from './spaces'

// SpaceFAQ takes a starter kit's questions (`items`), so a kit's FAQ draws before the Space has saved any, and the
// Space's own questions win once it has. The starter words carry no FAQPage data: they are not the operator's.

const items = [{ q: 'Can I change a booking?', a: 'Yes. Use the link in your confirmation email.' }, { q: '', a: 'No question' }]

function draw(props: Record<string, unknown>, faqs: { id: string; question: string; answer: string }[] = []) {
  const block = spacesComponents.SpaceFAQ
  const el = (block.render as (p: Record<string, unknown>) => React.ReactNode)({ ...block.defaultProps, ...props, puck: { metadata: { space: { faqs } } } })
  return renderToStaticMarkup(<>{el}</>)
}

describe('SpaceFAQ starter questions', () => {
  it('draws the kit questions when the Space has none, dropping an incomplete one', () => {
    const html = draw({ items })
    expect(html).toContain('Can I change a booking?')
    expect(html).not.toContain('No question')
  })

  it('carries no FAQPage structured data for the kit sample words', () => {
    expect(draw({ items })).not.toContain('FAQPage')
  })

  it('shows the Space own questions instead, with their FAQPage data', () => {
    const html = draw({ items }, [{ id: 'f1', question: 'Do you take walk-ins?', answer: 'Yes, on Saturdays.' }])
    expect(html).toContain('Do you take walk-ins?')
    expect(html).not.toContain('Can I change a booking?')
    expect(html).toContain('FAQPage')
  })

  it('still draws nothing when there are neither', () => {
    expect(draw({ items: [] })).toBe('')
  })
})
