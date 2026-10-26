import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { loadProbeModule } from '../lib/probe-module.mjs'

// Run real React component effects against local DOM/clock/frame recorders. No app backend.
process.env.NODE_ENV = 'test'
const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.invalid' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react'), jsx = require('react/jsx-runtime')
const { createRoot } = require('react-dom/client')
const { act } = React
let now = 1_000_000, serial = 0, reduced = false
const intervals = new Map(), frames = new Map()
Date.now = () => now
globalThis.setInterval = callback => { intervals.set(++serial, callback); return serial }
globalThis.clearInterval = id => { intervals.delete(id) }
globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial }
globalThis.cancelAnimationFrame = id => { frames.delete(id) }
window.matchMedia = () => ({ matches: reduced })
const common = { react: React, 'react/jsx-runtime': jsx }
const math = loadProbeModule('lib/on-air.ts')
const Link = props => React.createElement('a', props)
const host = document.createElement('div'); document.body.append(host)
const root = createRoot(host)
const render = async (Component, props = {}) => { await act(async () => root.render(React.createElement(Component, props))) }
const click = async label => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label)
  assert.ok(button, 'Missing timer control: ' + label)
  await act(async () => button.click())
}
const tick = async () => { await act(async () => { for (const callback of [...intervals.values()]) callback() }) }
const frame = async () => { const pending = [...frames.values()]; frames.clear(); await act(async () => { for (const callback of pending) callback(now) }) }
const mode = process.argv[2]
assert.ok(['completion', 'animation'].includes(mode), 'Select completion or animation')
try {
  if (mode === 'completion') {
    const publicModule = loadProbeModule('app/(marketing)/mindless/public-timer.tsx', {
      ...common, 'next/link': Link, '@/lib/on-air': math,
      '@/components/on-air/visualizer': { BreathVisualizer: () => null },
      '@/components/ui/button': { Button: ({ children, onClick }) => React.createElement('button', { onClick }, children), buttonClasses: () => '' },
    })
    const parts = loadProbeModule('components/frequency/site/pages/funnel/parts.tsx', {
      ...common, 'next/link': Link,
      '@/components/frequency/icon': loadProbeModule('components/frequency/icon.tsx', { 'react/jsx-runtime': jsx }),
      '@/app/themes/active/site-pages-b': {}, '@/app/themes/active/site-funnel': {},
    })
    const frequency = loadProbeModule('components/frequency/site/pages/funnel/mindless-timer.tsx', {
      ...common, 'next/link': Link, '@/lib/on-air': math,
      '@/components/on-air/visualizer': { BreathVisualizer: () => null },
      '@/app/(marketing)/mindless/public-timer': publicModule, './parts': parts,
    })
    for (const Timer of [publicModule.PublicTimer, frequency.FrequencyMindlessTimer]) {
      await render(Timer); assert.match(host.textContent, /5:00/)
      await click('Start 5 minutes'); assert.equal(intervals.size, 1)
      now += 12_000; await tick(); assert.match(host.textContent, /4:48/)
      await click('End early'); assert.match(host.textContent, /Session ended/); assert.doesNotMatch(host.textContent, /Five minutes, done/)
      assert.equal(intervals.size, 0, 'Ending a session releases its clock')
      await click('Sit again'); await click('Start 5 minutes')
      now += publicModule.PUBLIC_SESSION_SECONDS * 1000
      await click('End early'); assert.match(host.textContent, /Five minutes, done/)
      assert.equal(intervals.size, 0)
      await click('Sit again'); await click('Start 5 minutes')
      now += publicModule.PUBLIC_SESSION_SECONDS * 1000; await tick()
      assert.match(host.textContent, /Five minutes, done/); assert.equal(intervals.size, 0)
      assert.equal(host.querySelector('a').getAttribute('href'), publicModule.SAME_TIME_TOMORROW_HREF)
      await act(async () => root.render(null))
    }
    console.log('Actual DAWN/Frequency timers distinguish partial, deadline and natural completion; retry/link and clock cleanup preserved. No backend calls.')
  } else {
    const { BreathVisualizer } = loadProbeModule('components/on-air/visualizer.tsx', { ...common, '@/lib/on-air': math })
    const pattern = math.BREATH_PATTERNS.find(p => p.slug === 'cohere')
    const startedAt = now
    await render(BreathVisualizer, { pattern, startedAt, paused: true }); assert.equal(frames.size, 0, 'An idle timer schedules no animation work')
    await render(BreathVisualizer, { pattern, startedAt, paused: false }); assert.equal(frames.size, 1)
    now += 1000; await frame(); const snapshot = host.innerHTML
    await render(BreathVisualizer, { pattern, startedAt, paused: true }); assert.equal(frames.size, 0, 'Pause cancels pending frame work')
    now += 10_000; await frame(); assert.equal(host.innerHTML, snapshot)
    await render(BreathVisualizer, { pattern, startedAt: startedAt + 10_000, paused: false }); await frame(); assert.equal(host.innerHTML, snapshot)
    reduced = true
    await render(BreathVisualizer, { pattern, startedAt: startedAt + 10_001, paused: false }); await frame()
    assert.equal(host.querySelector('g').style.transform, '')
    assert.ok(Number(host.querySelector('g').style.opacity) > 0)
    await act(async () => root.render(null)); assert.equal(frames.size, 0)
    console.log('Actual breathing visualizer owns no idle/paused/unmounted frame, resumes at shifted time and preserves reduced-motion opacity. Local DOM/clock recorders only.')
  }
} finally { await act(async () => root.unmount()); dom.window.close() }
