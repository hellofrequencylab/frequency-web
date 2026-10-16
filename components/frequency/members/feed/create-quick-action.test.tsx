// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CreateButton, COMPOSE_EVENT, createMenuPosition } from './create-quick-action'
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { act(() => root?.unmount()); host?.remove(); document.body.style.overflow = ''; vi.restoreAllMocks() })
function open() {
  host = document.createElement('div'); host.style.overflow = 'hidden'; document.body.append(host)
  root = createRoot(host); act(() => root!.render(<CreateButton />))
  const trigger = host.querySelector('button')!; trigger.focus(); act(() => trigger.click())
  return trigger
}
describe('Create quick actions', () => {
  it('escapes clipping ancestors and retains all canonical destinations', () => {
    const trigger = open(); const dialog = document.querySelector('[role="dialog"]')!
    expect(host!.contains(dialog)).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect([...dialog.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['#compose','/events/new','/circles/new','/practices/new','/journeys/new','/classifieds/new'])
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('opens the existing composer once and closes the dialog', () => {
    const compose = vi.fn(); window.addEventListener(COMPOSE_EVENT, compose)
    open(); act(() => (document.querySelector('[role="dialog"] a') as HTMLAnchorElement).click())
    expect(compose).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="dialog"]')).toBeNull()
    window.removeEventListener(COMPOSE_EVENT, compose)
  })
  it('closes using the explicit accessible close control', () => {
    open(); act(() => (document.querySelector('button[aria-label="Close Create"]') as HTMLButtonElement).click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('dismisses only a true backdrop press and release', () => {
    open(); const backdrop = document.querySelector('[role="dialog"]')!.parentElement!
    act(() => { backdrop.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); backdrop.dispatchEvent(new MouseEvent('mouseup', {bubbles:true})) })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it.each([320,390,960])('bounds anchored positioning at %ipx even for an outlying trigger', width => {
    const p = createMenuPosition({right:558,bottom:369},width,844)
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.left + Math.min(360,width-24)).toBeLessThanOrEqual(width-12)
    expect(p.top+p.maxHeight).toBeLessThanOrEqual(832)
  })
})
