// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { WebsiteDocument } from './website-document'
vi.mock('@/lib/page-editor/block-render', () => ({ BlockRender: () => null }))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

it('reconciles directly edited text after commit and undo while preserving active native typing', () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const doc = (title: string, padding = 0): Data => ({ root: { props: { websiteLayout: { heading: { desktop: { padding } } } } }, content: [{ type: 'DisplayHeading', props: { id: 'heading', text: title } }] })
  const render = (data: Data) => <WebsiteDocument doc={data} theme="Menswork" config={{ components: {} }} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" title="Home" />
  act(() => root.render(render(doc('**Hearts** on Fire'))))
  container.querySelector('h1')!.innerHTML = 'Hearts on Fire — verified'
  act(() => root.render(render(doc('**Hearts** on Fire', 32))))
  expect(container.querySelector('h1')!.textContent).toBe('Hearts on Fire — verified')
  act(() => root.render(render(doc('Hearts on Fire — verified', 32))))
  expect(container.querySelector('h1')!.textContent).toBe('Hearts on Fire — verified')
  act(() => root.render(render(doc('**Hearts** on Fire'))))
  expect(container.querySelector('h1')!.textContent).toBe('Hearts on Fire')
  expect(container.querySelector('h1 strong')!.textContent).toBe('Hearts')
  act(() => root.unmount())
  container.remove()
})
