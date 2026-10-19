// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The Vercel component is replaced so the test reads the beforeSend the wrapper hands it.
const mocks = vi.hoisted(() => ({ beforeSend: null as null | ((e: { type: string; url: string }) => unknown) }))
vi.mock('@vercel/analytics/next', () => ({
  Analytics: (props: { beforeSend: (e: { type: string; url: string }) => unknown }) => { mocks.beforeSend = props.beforeSend; return null },
}))

import { Analytics } from './vercel-analytics'

describe('Vercel Web Analytics beforeSend (LIVE-810, SCAN-838)', () => {
  it('redacts the slug and drops the query string and hash', () => {
    renderToStaticMarkup(<Analytics />)
    const send = mocks.beforeSend!
    expect(send({ type: 'pageview', url: 'https://frequencylocal.com/journeys/grief-walks?ref=mail#top' }))
      .toEqual({ type: 'pageview', url: 'https://frequencylocal.com/journeys/[slug]' })
    expect(send({ type: 'pageview', url: 'https://frequencylocal.com/pricing?topic=grief' }))
      .toEqual({ type: 'pageview', url: 'https://frequencylocal.com/pricing' })
    expect(send({ type: 'pageview', url: 'https://frequencylocal.com' }))
      .toEqual({ type: 'pageview', url: 'https://frequencylocal.com/' })
  })
})
