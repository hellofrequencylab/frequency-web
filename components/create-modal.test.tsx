// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Plus } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CREATE-MODAL IS A SHELL, NOT AN OVERLAY (ADR-1100).
//
// `docs/STUDIO.md` §6 said to retire this file "once circles move". Circles moved and nothing
// followed, so eight surfaces stayed on a second, hand-rolled overlay: its own backdrop, focus
// trap, ESC handler and scroll lock, none of which portalled.
//
// These assertions are about what the eight consumers GAINED, and every one of them fails against
// the pre-change file — because the old overlay rendered in place, so there was no portal to test.
// The last two are the regression half: a pending submit must still block every exit, and that is
// NOT inherited from `Dialog` (which knows nothing about a form being mid-flight). It had to be
// re-stated by hand, so it has to be re-tested by hand.
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const { CreateModal } = await import('./create-modal')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  document.body.style.overflow = ''
})

const BASE = {
  open: true,
  onSubmit: () => {},
  title: 'New Hub',
  titleIcon: Plus,
  submitLabel: 'Create',
}

function render(node: React.ReactNode, themed?: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  let mountPoint: HTMLElement = container
  if (themed) {
    const scope = document.createElement('div')
    scope.setAttribute('data-space-theme', themed)
    scope.style.setProperty('--color-primary', '#0F8E78')
    container.appendChild(scope)
    mountPoint = scope
  }
  root = createRoot(mountPoint)
  act(() => root!.render(node))
}

/** The portaled overlay root: a direct child of <body> that is not our own container. */
const overlay = () => document.querySelector<HTMLElement>('body > div.fixed.inset-0')
const findButton = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(label))

describe('the overlay is the shared primitive', () => {
  it('portals to <body>, so a transformed ancestor can no longer trap it', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>)
    expect(overlay()).not.toBeNull()
    expect(overlay()!.parentElement).toBe(document.body)
  })

  it('carries the Space theme across that portal', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>, 'editorial')
    expect(overlay()?.getAttribute('data-space-theme')).toBe('editorial')
    expect(overlay()?.style.getPropertyValue('--color-primary')).toBe('#0F8E78')
  })

  it('sits in the shared modal tier, not the old z-50', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>)
    expect(overlay()!.className).toContain('z-[80]')
  })

  it('is a bottom sheet on mobile and a centred card at sm+', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>)
    expect(overlay()!.className).toContain('items-end')
    expect(overlay()!.className).toContain('sm:items-center')
  })

  it('declares its dialog semantics once, on the primitive, not on the form', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>)
    const dialogs = document.querySelectorAll('[role="dialog"]')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0].tagName).not.toBe('FORM')
    expect(dialogs[0].getAttribute('aria-label')).toBe('New Hub')
  })

  it('renders nothing at all when closed', () => {
    render(
      <CreateModal {...BASE} open={false} onClose={() => {}}>
        fields
      </CreateModal>,
    )
    expect(overlay()).toBeNull()
  })
})

describe('a pending submit still blocks every exit', () => {
  it('the close button does nothing while pending', () => {
    const onClose = vi.fn()
    render(
      <CreateModal {...BASE} isPending onClose={onClose}>
        fields
      </CreateModal>,
    )
    const x = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
    expect(x).not.toBeNull()
    act(() => x!.click())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('and closes normally when it is not pending', () => {
    const onClose = vi.fn()
    render(
      <CreateModal {...BASE} onClose={onClose}>
        fields
      </CreateModal>,
    )
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Cancel is disabled while pending, so the footer agrees with the header', () => {
    render(
      <CreateModal {...BASE} isPending onClose={() => {}}>
        fields
      </CreateModal>,
    )
    expect(findButton('Cancel')?.disabled).toBe(true)
  })

  it('submit shows the pending label and is disabled', () => {
    render(
      <CreateModal {...BASE} isPending pendingLabel="Creating…" onClose={() => {}}>
        fields
      </CreateModal>,
    )
    expect(findButton('Creating…')?.disabled).toBe(true)
  })
})

describe('the shell still renders what it always did', () => {
  it('shows the error banner when there is one', () => {
    render(
      <CreateModal {...BASE} error="Name is taken" onClose={() => {}}>
        fields
      </CreateModal>,
    )
    expect(overlay()!.textContent).toContain('Name is taken')
  })

  it('keeps the footer clear of a notched phone home indicator', () => {
    render(<CreateModal {...BASE} onClose={() => {}}>fields</CreateModal>)
    const footer = Array.from(overlay()!.querySelectorAll('div')).find((d) =>
      d.className.includes('border-t'),
    )
    expect(footer?.className).toContain('env(safe-area-inset-bottom)')
  })
})
