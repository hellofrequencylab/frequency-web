import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { HuntConsentPanel } from './hunt-consent-panel'

const disclosure = { spaceName: 'North Park Shop', disclosureVersion: 'draft-v1' }
afterEach(() => vi.unstubAllEnvs())

it('requires both the Hunts master switch and explicit activation', () => {
  vi.stubEnv('HUNTS_ENABLED', '')
  expect(renderToStaticMarkup(<HuntConsentPanel {...disclosure} state="not-subscribed" enabled />)).toBe('')
  vi.stubEnv('HUNTS_ENABLED', 'on')
  expect(renderToStaticMarkup(<HuntConsentPanel {...disclosure} state="not-subscribed" />)).toBe('')
})

it('names the Space, shows the disclosure version and leaves opt-in unchecked', () => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  const html = renderToStaticMarkup(<HuntConsentPanel {...disclosure} state="not-subscribed" enabled />)
  expect(html).toContain('Email me updates and offers from North Park Shop')
  expect(html).toContain('Email permission version draft-v1')
  expect(html).toContain('progress, access, rewards, or prices')
  expect(html).toContain('type="checkbox"')
  expect(html).not.toMatch(/\schecked(?:=|\s|>)/)
  expect(html).toMatch(/<button[^>]+disabled/)
  expect(html).not.toContain('<form')
})

it('shows withdrawal only for an active permission and never claims a new opt-in', () => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  const subscribed = renderToStaticMarkup(<HuntConsentPanel {...disclosure} state="subscribed" enabled />)
  const withdrawn = renderToStaticMarkup(<HuntConsentPanel {...disclosure} state="withdrawn" enabled />)
  expect(subscribed).toContain('Withdraw email permission')
  expect(subscribed).not.toContain('type="checkbox"')
  expect(withdrawn).toContain('You withdrew email permission')
  expect(withdrawn).not.toMatch(/\schecked(?:=|\s|>)/)
})
