// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
import { InstantGrid, MarketSearchBar, MarketSearchProvider } from './market-search'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it('the semantic compact-header input still filters existing client-side results immediately', () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  act(() => root.render(<MarketSearchProvider><MarketSearchBar placeholder="Find a Space"/><InstantGrid items={[{text:'Yoga studio'},{text:'Bike repair'}]} className="results" empty={<p>No matches</p>}><div>Yoga studio</div><div>Bike repair</div></InstantGrid></MarketSearchProvider>))
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Find a Space"]')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'YOGA'); input.dispatchEvent(new Event('input',{bubbles:true})) })
  expect(host.querySelector('.results')?.textContent).toBe('Yoga studio')
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})) })
  expect(host.querySelector('.results')?.textContent).toBe('Yoga studioBike repair')
  act(() => root.unmount()); host.remove()
})
