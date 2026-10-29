// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SiteSubscribePanel } from './site-subscribe-panel'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const written: string[] = []
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true })

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  written.length = 0
})

describe('the website calendar Subscribe panel', () => {
  const mount = () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root.render(
        <SiteSubscribePanel brandName="Ocean House" httpsUrl="https://example.test/spaces/ocean-house/calendar.ics" webcalUrl="webcal://example.test/spaces/ocean-house/calendar.ics" />,
      ),
    )
  }

  it('says what subscribing does and offers Apple, Google and the link, all open', () => {
    mount()
    expect(host.textContent).toContain('Ocean House in your calendar')
    expect(host.textContent).toContain('stay current on their own')
    const links = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links[0]).toBe('webcal://example.test/spaces/ocean-house/calendar.ics')
    expect(links[1]).toContain('calendar.google.com/calendar/r?cid=')
  })

  it('copies the public link', async () => {
    mount()
    const copy = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy link'))!
    await act(async () => void copy.click())
    expect(written).toEqual(['https://example.test/spaces/ocean-house/calendar.ics'])
    expect(host.textContent).toContain('Copied')
  })

  it('never asks anyone to keep the public link private', () => {
    mount()
    expect(host.textContent).not.toMatch(/private/i)
  })
})
