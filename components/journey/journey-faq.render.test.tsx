// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { JourneyFaq, genericJourneyFaq } from './discovery-widgets'
import { writeJourneyFaq } from '@/lib/journeys/faq'

// THE QUESTIONS A HOST WROTE REPLACE THE GENERIC SET (LIVE-394). What these pin:
//   * a Journey with nothing authored keeps every generic question it showed before, so no page
//     loses its FAQ the day the field lands;
//   * the first authored pair replaces the generic set WHOLE, so a host who wrote their questions
//     never finds the platform's four ahead of them;
//   * the authored copy renders verbatim, under the same heading the Q&A composer avoids.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

const base = { drip_interval_days: 7, certificate_enabled: true }

describe('JourneyFaq', () => {
  it('falls back to the generic set when the host has written no questions', () => {
    const el = mount(<JourneyFaq plan={{ ...base, page_config: null }} />)
    expect(el.textContent).toContain('Questions')
    for (const f of genericJourneyFaq(base)) expect(el.textContent).toContain(f.q)
    expect(el.querySelectorAll('details')).toHaveLength(genericJourneyFaq(base).length)
  })

  it('still falls back when the story entry exists but carries no questions', () => {
    const el = mount(<JourneyFaq plan={{ ...base, page_config: [{ id: 'story', enabled: true, settings: { outcomes: ['x'] } }] }} />)
    expect(el.querySelectorAll('details')).toHaveLength(genericJourneyFaq(base).length)
  })

  it('renders the authored questions verbatim and none of the generic set', () => {
    const page_config = writeJourneyFaq(null, [
      { q: 'Is this for total beginners?', a: 'Yes. Week one assumes nothing.' },
      { q: 'What if I miss a live call?', a: 'Every call is recorded and stays in the phase.' },
    ])
    const el = mount(<JourneyFaq plan={{ ...base, page_config }} />)
    expect(el.textContent).toContain('Is this for total beginners?')
    expect(el.textContent).toContain('Every call is recorded and stays in the phase.')
    expect(el.querySelectorAll('details')).toHaveLength(2)
    for (const f of genericJourneyFaq(base)) expect(el.textContent).not.toContain(f.q)
  })
})
