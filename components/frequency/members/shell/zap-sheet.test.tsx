// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
const { openTimer } = vi.hoisted(() => ({ openTimer: vi.fn() }))
vi.mock('@/components/on-air/mindless', () => ({ useMindless: () => ({ open: openTimer }) }))
import { ZapSheet } from './zap-sheet'
let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); vi.clearAllMocks(); document.body.innerHTML = '' })
function mount() {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const close = vi.fn()
  act(() => root.render(<ZapSheet onClose={close} />))
  cleanup = () => act(() => root.unmount())
  return { host, trigger, close }
}
describe('Frequency Zap quick actions', () => {
  it('preserves creation and code destinations and restores the old scanning/log doors', () => {
    const { host } = mount()
    expect(Array.from(host.querySelectorAll('a')).map(a => a.getAttribute('href'))).toEqual(['/events/new', '/codes', '/events/scan', '/connections/new', '/journal'])
    expect(host.textContent).not.toContain('+25')
  })
  it('hands Share and Contact to the existing capture modes, and Mindless directly to the timer', () => {
    const { host, close } = mount(); const modes: string[] = []
    const listener = (e: Event) => modes.push((e as CustomEvent).detail.mode)
    window.addEventListener('open-capture', listener)
    const buttons = Array.from(host.querySelectorAll('button'))
    act(() => buttons.find(b => b.textContent?.includes('Share'))!.click())
    act(() => buttons.find(b => b.textContent?.includes('Save contact'))!.click())
    act(() => buttons.find(b => b.textContent?.includes('Mindless'))!.click())
    window.removeEventListener('open-capture', listener)
    expect(modes).toEqual(['post','contact']); expect(openTimer).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(3)
  })
  it('locks page scrolling, traps tab focus and restores the trigger on dismissal', () => {
    const { host, trigger } = mount()
    const first = host.querySelector('button')!, last = host.querySelectorAll('a')[4]!
    expect(document.activeElement).toBe(first); expect(document.documentElement.style.overflow).toBe('hidden')
    first.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', shiftKey:true,bubbles:true,cancelable:true }))
    expect(document.activeElement).toBe(last)
    last.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', bubbles:true,cancelable:true }))
    expect(document.activeElement).toBe(first)
    cleanup?.(); cleanup = undefined
    expect(document.activeElement).toBe(trigger); expect(document.documentElement.style.overflow).toBe('')
  })
})
