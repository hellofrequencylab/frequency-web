// @vitest-environment jsdom
import { act, lazy, Suspense, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { NavViewer } from '@/lib/nav/registry'
const delayed = vi.hoisted(() => ({ loads: 0, release: undefined as undefined | (() => void) }))
vi.mock('next/dynamic', () => ({ default: (load: () => Promise<ComponentType<{ onClose: () => void; viewer: NavViewer }>>) => {
  const Deferred = lazy(async () => {
    delayed.loads++
    await new Promise<void>((resolve) => { delayed.release = resolve })
    return { default: await load() }
  })
  return (props: { onClose: () => void; viewer: NavViewer }) => <Suspense fallback={null}><Deferred {...props} /></Suspense>
} }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/lib/nav/registry', () => ({ paletteDestinations: () => [] }))
vi.mock('@/components/layout/nav-icons', () => ({ railIconFor: () => () => null }))
vi.mock('@/components/ui/use-dialog-focus-trap', () => ({ useDialogFocusTrap: () => {} }))
import { MemberSearch } from './member-search'

it('defers the real search chunk, cancels a pending open, then preserves keyboard open, input focus and dismissal', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  try {
    await act(async () => root.render(<MemberSearch viewer={{ role: 'member', staffRole: null, operatesSpaces: false }} />))
    expect(delayed.loads).toBe(0)
    await act(async () => { window.dispatchEvent(new Event('open-search')) })
    expect(delayed.loads).toBe(1)
    expect(host.querySelector('input')).toBeNull()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); delayed.release?.() })
    expect(host.querySelector('input')).toBeNull()
    const ctrl = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true })
    await act(async () => { window.dispatchEvent(ctrl) })
    expect(ctrl.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(host.querySelector('input')).not.toBeNull())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    expect(document.activeElement).toBe(host.querySelector('input'))
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(host.querySelector('input')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    const meta = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    await act(async () => { window.dispatchEvent(meta) })
    expect(meta.defaultPrevented).toBe(true)
    expect(host.querySelector('input')).not.toBeNull()
    expect(delayed.loads).toBe(1)
    expect(fetch).not.toHaveBeenCalled()
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})
