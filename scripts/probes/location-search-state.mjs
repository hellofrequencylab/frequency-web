import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { loadProbeModule } from '../lib/probe-module.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/network' })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const React = require('react'); const { act } = React
const { createRoot } = require('react-dom/client')
const timers = new Map(); const realSet = globalThis.setTimeout; const realClear = globalThis.clearTimeout
// Intercept only the component's debounce. React's own scheduler retains real timers.
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay !== 280) return realSet(callback, delay, ...args)
  const key = {}; timers.set(key, () => callback(...args)); return key
}
globalThis.clearTimeout = timer => timers.has(timer) ? timers.delete(timer) : realClear(timer)
const pending = []; const pushes = []
const icon = props => React.createElement('span', { className: props.className, 'aria-hidden': true })
const { CircleLocationSearch } = loadProbeModule('components/circles/circle-location-search.tsx', {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }), usePathname: () => '/network', useSearchParams: () => new URLSearchParams('view=circles&online=1') },
  'lucide-react': { Search: icon, LocateFixed: icon, X: icon, Loader2: icon, MapPin: icon },
  '@/lib/geocode': { searchPlaces: (_query, signal) => new Promise((resolve, reject) => pending.push({ resolve, reject, signal })) },
})
let root; let container
async function mount() {
  if (root) { await act(async () => root.unmount()); container.remove() }
  timers.clear(); pending.length = 0
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(React.createElement(CircleLocationSearch)))
}
async function type(value) {
  await act(async () => {
    const input = container.querySelector('input')
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await act(async () => { const work = [...timers.values()]; timers.clear(); work.forEach(callback => { void callback() }) })
}
const place = label => ({ label, lat: 33.123456, lng: -117.123456 })
try {
  await mount(); await type('Vista'); await type('London')
  assert.equal(pending[0].signal.aborted, true)
  await act(async () => pending[1].resolve([place('London')]))
  await act(async () => pending[0].resolve([place('Vista')]))
  assert.ok(container.textContent.includes('London')); assert.ok(!container.textContent.includes('Vista'))
  await act(async () => container.querySelector('li button').click())
  const url = new URL(pushes[0], 'https://example.test')
  assert.equal(url.searchParams.get('online'), '1'); assert.equal(url.searchParams.get('view'), 'circles')
  assert.equal(url.searchParams.get('near'), '33.12346,-117.12346')
  await mount(); await type('Vista'); assert.ok(container.querySelector('.animate-spin'))
  await type(''); assert.equal(container.querySelector('.animate-spin'), null)
  await act(async () => pending[0].resolve([place('Vista')]))
  assert.equal(container.querySelector('ul'), null)
  await mount(); await type('Vista'); await act(async () => pending[0].reject(new Error('Provider JSON failed')))
  assert.equal(container.querySelector('.animate-spin'), null)
  await type('London'); await act(async () => pending[1].resolve([place('London')]))
  assert.ok(container.textContent.includes('London'))
  console.log('Actual React city search rejects stale responses, clears loading, recovers from rejection and preserves URL filters.')
} finally {
  if (root) await act(async () => root.unmount())
  globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; dom.window.close()
}
