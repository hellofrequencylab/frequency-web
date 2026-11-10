import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { HuntDonationAsk } from './hunt-donation-ask'

const ask = { beneficiaryName: 'Community Food Pantry', purpose: 'Help stock the pantry for local families.' }
afterEach(() => vi.unstubAllEnvs())

it('requires both the Hunts master switch and explicit activation', () => {
  vi.stubEnv('HUNTS_ENABLED', '')
  expect(renderToStaticMarkup(<HuntDonationAsk {...ask} enabled />)).toBe('')
  vi.stubEnv('HUNTS_ENABLED', 'on')
  expect(renderToStaticMarkup(<HuntDonationAsk {...ask} />)).toBe('')
})

it('names the beneficiary and separates the optional donation from play and sponsor pledges', () => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  const html = renderToStaticMarkup(<HuntDonationAsk {...ask} enabled />)
  for (const copy of [ask.beneficiaryName, ask.purpose, 'Playing is free', 'Giving is optional', 'Sponsor pledges are reported separately']) {
    expect(html).toContain(copy)
  }
  expect(html).toMatch(/<button[^>]+disabled/)
  expect(html).not.toContain('<form')
})
