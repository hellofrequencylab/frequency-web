// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { TokenRequestPanel } from './token-request-panel'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach((c) => c()) })

function mount(onSend: Parameters<typeof TokenRequestPanel>[0]['onSend']) {
  const el = document.createElement('div')
  document.body.append(el)
  const root = createRoot(el)
  act(() => root.render(<TokenRequestPanel onSend={onSend} />))
  cleanups.push(() => { act(() => root.unmount()); el.remove() })
  return el
}
function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

it('keeps Send off until a token and a want are written, then sends and confirms', async () => {
  const send = vi.fn(async () => ({ ok: true as const, ref: 1042 }))
  const el = mount(send)
  const btn = el.querySelector('button') as HTMLButtonElement
  expect(btn.disabled).toBe(true)
  type(el, 'input[type=text]', '--th-accent-soft')
  type(el, 'textarea', 'A softer accent for badges')
  expect(btn.disabled).toBe(false)
  await act(async () => { btn.click() })
  expect(send).toHaveBeenCalledWith([{ token: '--th-accent-soft', want: 'A softer accent for badges', why: '' }])
  expect(el.textContent).toContain('#1042')
})

it('shows the refusal in plain words and does not clear the form', async () => {
  const el = mount(async () => ({ ok: false as const, error: 'Describe the look in words.' }))
  type(el, 'input[type=text]', 'x')
  type(el, 'textarea', 'color: red;')
  await act(async () => { (el.querySelector('button') as HTMLButtonElement).click() })
  expect(el.querySelector('[role=alert]')?.textContent).toContain('Describe the look in words.')
})
