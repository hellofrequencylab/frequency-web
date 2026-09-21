// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LoomImageEditor } from './loom-image-editor'
import { CROP_FRAMES } from '@/lib/library/renditions'
import type { RotationBaker } from './rotate-image'

// The native crop + rotate editor (HYG-109, ADR-1506). Locks the interaction-state set from
// docs/INTERACTION-STATES.md §2 for an Action surface: rest, pressed, loading (aria-busy),
// disabled, error, focus. jsdom has no canvas and never loads an <img>, so the rotate seam is a
// fake: a baker that resolves stands in for the canvas, one that rejects drives the error state,
// and one that never settles holds the loading state open.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.innerHTML = ''
})

const asset = { id: 'a1', url: 'https://cdn/master.png', mime: 'image/png', slug: 'master', title: 'Master' }
const resolved: RotationBaker = async (url, degrees) => ({ src: degrees === 0 ? url : `blob:rot-${degrees}`, revoke() {} })
const rejected: RotationBaker = async () => {
  throw new Error('tainted')
}
const never: RotationBaker = () => new Promise(() => {})

async function mount(bake: RotationBaker, save = vi.fn(async () => ({ ok: true as const, url: 'https://cdn/new.png' }))) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <LoomImageEditor asset={asset} open onClose={() => {}} onSaved={() => {}} save={save} bake={bake} />,
    )
  })
  // Let the baker's promise settle.
  await act(async () => {
    await Promise.resolve()
  })
  return document.body
}

const byLabel = (body: HTMLElement, label: string) =>
  body.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? body.querySelector<HTMLElement>(`button[title="${label}"]`)

describe('LoomImageEditor rest', () => {
  it('is a named dialog that offers every CROP_FRAMES preset with Freeform pressed and no rotation', async () => {
    const body = await mount(resolved)
    const dialog = body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.getAttribute('aria-labelledby')).toBe('loom-image-editor-title')
    const group = body.querySelector('[role="group"][aria-label="Crop frame"]')!
    const buttons = [...group.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(CROP_FRAMES.map((f) => f.label))
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', ...CROP_FRAMES.slice(1).map(() => 'false')])
    expect(body.textContent).toContain('No rotation')
  })
})

describe('LoomImageEditor pressed', () => {
  it('marks the chosen frame pressed and unpresses Freeform', async () => {
    const body = await mount(resolved)
    const group = body.querySelector('[role="group"][aria-label="Crop frame"]')!
    const square = [...group.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Square'))!
    await act(async () => {
      square.click()
    })
    expect(square.getAttribute('aria-pressed')).toBe('true')
    expect(group.querySelector('button')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('a rotate press adds a quarter turn and the straighten slider adds degrees on top', async () => {
    const body = await mount(resolved)
    await act(async () => {
      byLabel(body, 'Rotate right')!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(body.textContent).toContain('90° total')
    const slider = body.querySelector<HTMLInputElement>('input[type="range"][aria-label="Straighten"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(slider, '5')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(body.textContent).toContain('95° total')
    expect(slider.getAttribute('aria-valuetext')).toBe('5 degrees')
  })
})

describe('LoomImageEditor loading + disabled', () => {
  it('is aria-busy while a rotation bakes, and every frame and rotate control is disabled until it settles', async () => {
    const body = await mount(never)
    const panel = body.querySelector('[aria-busy="true"]')
    expect(panel).not.toBeNull()
    expect(body.textContent).toContain('Loading image…')
    const group = body.querySelector('[role="group"][aria-label="Crop frame"]')!
    for (const b of group.querySelectorAll('button')) expect(b.hasAttribute('disabled')).toBe(true)
    expect(byLabel(body, 'Rotate left')!.hasAttribute('disabled')).toBe(true)
    expect(body.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(true)
  })

  it('leaves aria-busy and re-enables the controls once the bake resolves', async () => {
    const body = await mount(resolved)
    expect(body.querySelector('[aria-busy="true"]')).toBeNull()
    const group = body.querySelector('[role="group"][aria-label="Crop frame"]')!
    for (const b of group.querySelectorAll('button')) expect(b.hasAttribute('disabled')).toBe(false)
  })
})

describe('LoomImageEditor error', () => {
  it('reports a rotation that cannot be baked as an alert and keeps a Close door', async () => {
    const body = await mount(rejected)
    const alert = body.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert!.textContent).toMatch(/could not be rotated/)
    const close = [...body.querySelectorAll('button')].find((b) => b.textContent === 'Close')
    expect(close).toBeDefined()
    expect(close!.hasAttribute('disabled')).toBe(false)
  })
})

describe('LoomImageEditor focus', () => {
  it('every control is keyboard reachable: a real button or input, none removed from the tab order', async () => {
    const body = await mount(resolved)
    const controls = body.querySelectorAll('[role="dialog"] button, [role="dialog"] input')
    expect(controls.length).toBeGreaterThanOrEqual(CROP_FRAMES.length + 3)
    for (const c of controls) expect(c.getAttribute('tabindex')).not.toBe('-1')
  })
})
