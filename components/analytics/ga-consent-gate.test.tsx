// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { applyGaAccountGate } from '@/lib/analytics/ga-account-gate'

const ID = 'G-TESTACCOUNT'
const state = () => window as unknown as Record<string, unknown>
afterEach(() => {
  delete state().__fqGaAccountDisabled
  delete state().__fqGaBrowserDisabled
  delete state()[`ga-disable-${ID}`]
  localStorage.clear()
  document.cookie = 'fq_consent=; path=/; max-age=0'
  document.cookie = 'fq_ask=; path=/; max-age=0'
  vi.unstubAllEnvs()
})
it('account regrant clears only its own suppression and preserves browser and staff choices', () => {
  applyGaAccountGate(ID, true)
  expect(state()[`ga-disable-${ID}`]).toBe(true)
  applyGaAccountGate(ID, false)
  expect(state()[`ga-disable-${ID}`]).toBe(false)
  document.cookie = 'fq_consent=denied; path=/'
  applyGaAccountGate(ID, true); applyGaAccountGate(ID, false)
  expect(state()[`ga-disable-${ID}`]).toBe(true)
  document.cookie = 'fq_consent=granted; path=/'
  localStorage.setItem('freq-ga-optout', '1')
  applyGaAccountGate(ID, true); applyGaAccountGate(ID, false)
  expect(state()[`ga-disable-${ID}`]).toBe(true)
})
it('the serialized parser gate and React navigation gate apply the same state', async () => {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', ID)
  vi.resetModules()
  const { GaConsentGate } = await import('./ga-consent-gate')
  const html = renderToStaticMarkup(<GaConsentGate disabled />)
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  expect(script).toBeTruthy()
  new Function(script!)()
  expect(state().__fqGaAccountDisabled).toBe(true)
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    act(() => root.render(<GaConsentGate disabled={false} />))
    expect(state().__fqGaAccountDisabled).toBe(false)
    expect(state()[`ga-disable-${ID}`]).toBe(false)
    act(() => root.render(<GaConsentGate disabled />))
    expect(state()[`ga-disable-${ID}`]).toBe(true)
  } finally { act(() => root.unmount()) }
})
