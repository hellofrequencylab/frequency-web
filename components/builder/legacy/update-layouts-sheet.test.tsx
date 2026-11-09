// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { UpdateLayoutsSheet } from '@/components/builder/legacy/update-layouts-sheet'
import type { LegacyPlan } from '@/lib/builder/legacy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const plan: LegacyPlan = { rows: [{ id: 'one', from: 'Old hero', to: 'Say who you are', role: 'hero', carried: ['Headline'], dropped: [], before: { type: 'MidnightHero', props: { id: 'one' } }, after: { type: 'RoleHero', props: { id: 'one' } } }], kept: [] }
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(async () => { await act(async () => root?.unmount()); host?.remove() })
function Harness() {
  const [open, setOpen] = useState(false)
  const [converted, setConverted] = useState(false)
  return <><button id="builder-undo">Undo</button>{!converted && <button id="review" onClick={() => setOpen(true)}>Review layouts</button>}{open && <UpdateLayoutsSheet plan={plan} pageLabel="Home" preview={() => null} onClose={() => setOpen(false)} onApply={() => { setOpen(false); setConverted(true) }} focusFallbackId="builder-undo" />}</>
}
async function open() {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => root!.render(<Harness />))
  const opener = host.querySelector<HTMLButtonElement>('#review')!; opener.focus()
  await act(async () => opener.click())
  return opener
}
it('cancel restores focus to the retained opener', async () => {
  const opener = await open()
  await act(async () => [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Not now')!.click())
  expect(document.activeElement).toBe(opener)
})
it('applying all restores focus to a stable visible builder action when the opener disappears', async () => {
  await open(); const apply = host!.querySelector<HTMLButtonElement>('[data-action="update-layouts-apply"]')!; apply.focus()
  await act(async () => apply.click())
  expect(host!.querySelector('#review')).toBeNull()
  expect(document.activeElement).toBe(host!.querySelector('#builder-undo'))
})
it('Tab and Shift+Tab stay among modal controls', async () => {
  await open(); const controls = [...host!.querySelector('[role="dialog"]')!.querySelectorAll<HTMLElement>('input, button:not([disabled])')]
  controls.at(-1)!.focus()
  await act(async () => { controls.at(-1)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })) })
  expect(document.activeElement).toBe(controls[0])
  await act(async () => { controls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })) })
  expect(document.activeElement).toBe(controls.at(-1))
})
