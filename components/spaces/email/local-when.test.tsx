import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocalWhen, formatWhenLocal, formatWhenUtc } from './local-when'

// THE CAMPAIGN LIST'S CLOCK (SCAN-702). The server reading is UTC and SAYS so; the viewer reading is
// the browser's own zone. Neither prints a zone-less time that could be mistaken for local.

describe('LocalWhen', () => {
  const iso = '2026-06-21T21:30:00.000Z'

  it('server-renders the instant in UTC, labelled, inside a <time> that carries the instant', () => {
    const html = renderToStaticMarkup(<LocalWhen iso={iso} />)
    expect(html).toContain(`dateTime="${iso}"`)
    expect(html).toContain('Jun 21, 2026')
    expect(html).toContain('9:30 PM UTC')
  })

  it('formats the viewer reading in the local zone and the UTC reading in UTC', () => {
    expect(formatWhenUtc(iso)).toBe('Jun 21, 2026, 9:30 PM UTC')
    const local = formatWhenLocal(iso)
    expect(local).not.toBe('')
    expect(local).toBe(new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso)))
  })

  it('renders nothing readable for an invalid instant instead of throwing', () => {
    expect(formatWhenUtc('nope')).toBe('')
    expect(formatWhenLocal('nope')).toBe('')
  })
})
