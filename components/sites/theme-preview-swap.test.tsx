// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { TryItOnBar, TryItOnSheet, legacyBlocksOn, prefetchTheme, useTryItOnSkin } from './theme-preview-swap'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach((c) => c()) })

const docs = [{ blocks: [{ type: 'DesignerHero' }, { type: 'MidnightProof' }, { type: 'Text' }] }]

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanups.push(() => { act(() => root.unmount()); host.remove() })
  return { host, root }
}

it('counts the legacy blocks a candidate theme lays out anew, and none on a family own theme', () => {
  expect(legacyBlocksOn(docs, 'temple-kit')).toEqual({ count: 2, families: ['designer', 'midnight'] })
  expect(legacyBlocksOn(docs, 'designer').count).toBe(1)
  expect(legacyBlocksOn([{ blocks: [{ type: 'Text' }] }], 'designer').count).toBe(0)
})

it('warms the contract skin once on hover', () => {
  expect(prefetchTheme()).toBe(prefetchTheme())
})

function Probe({ themeId, out }: { themeId: string | null; out: (v: string | null | undefined) => void }) {
  const css = useTryItOnSkin(docs, themeId)
  out(css)
  return css ? <TryItOnSheet css={css} themeId={themeId!} /> : null
}

it('holds the old look (null) until the skin is loaded, then yields it with the sheet in one commit', async () => {
  const { host, root } = mount()
  const seen: (string | null | undefined)[] = []
  act(() => root.render(<Probe themeId={null} out={(v) => seen.push(v)} />))
  expect(seen.at(-1)).toBeUndefined()
  await act(async () => { root.render(<Probe themeId="temple-kit" out={(v) => seen.push(v)} />) })
  await act(async () => { await prefetchTheme() })
  expect(seen).toContain(null)
  expect(typeof seen.at(-1)).toBe('string')
  expect(host.querySelector('style[data-try-it-on="temple-kit"]')?.textContent).toContain('data-skin-family')
  // The loading frames drew no sheet: a null result renders nothing.
  expect(seen.indexOf(null)).toBeLessThan(seen.findIndex((v) => typeof v === 'string' && v.length > 0))
})

it('labels legacy blocks in the bar and offers both ways out', () => {
  const { host, root } = mount()
  act(() => root.render(<TryItOnBar label="Temple" legacyCount={2} onKeep={() => {}} onLeave={() => {}} />))
  expect(host.textContent).toContain('2 blocks were drawn for another theme')
  expect(host.textContent).toContain('Nothing is saved until you keep it')
  expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Keep this look', 'Back to mine'])
})
