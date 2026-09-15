// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MOBILE CENTRE BUTTON CREATES SOMETHING (LIVE-247, docs/CORE-MODEL.md §5 phase 7 row 5.2).
//
// The raised disc in the middle of the mobile tab bar used to fire `open-capture` straight into
// the Zap menu. It now opens the Create sheet: Post first (the Zap menu's door, so nothing that
// was reachable is lost), then the structured creates from the ONE list in
// components/feed/create-actions.ts. These tests press the real button and read the real sheet;
// the last block reads app-shell.tsx as source, because the shell cannot be mounted here and the
// wiring is a fact about that file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

const { CreateButton } = await import('./create-button')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  document.body.style.overflow = ''
})

async function mount(role: 'member' | 'host' | null) {
  await act(async () => {
    root!.render(<CreateButton role={role} />)
    await Promise.resolve()
  })
}

function button(): HTMLButtonElement {
  const b = container!.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null
  if (!b) throw new Error('the centre button is not rendered')
  return b
}

async function press() {
  await act(async () => {
    button().click()
    await Promise.resolve()
  })
  // The Dialog portals on the client only, after its isClient store flips; give it a tick.
  await act(async () => {
    await Promise.resolve()
  })
}

function sheet(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

function hrefs(): string[] {
  return Array.from(sheet()!.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!)
}

describe('the centre button opens the Create sheet', () => {
  it('is closed until pressed, then opens a dialog named Create', async () => {
    await mount('member')
    expect(sheet()).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
    await press()
    const dialog = sheet()
    expect(dialog).not.toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('true')
    // Named by its own visible heading, not a restated aria-label.
    const labelledBy = dialog!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Create')
  })

  it('offers a post, an event and a circle to a plain member', async () => {
    await mount('member')
    await press()
    const rows = Array.from(sheet()!.querySelectorAll('li')).map((li) => li.textContent ?? '')
    expect(rows[0]).toContain('Post')
    expect(hrefs()).toContain('/events/new')
    expect(hrefs()).toContain('/circles/new')
    // The host-only creates stay host-only: gating is the list's, not the sheet's.
    expect(hrefs()).not.toContain('/nearby')
    expect(hrefs()).not.toContain('/messages')
  })

  it('adds the host creates for a host, from the same list', async () => {
    await mount('host')
    await press()
    expect(hrefs()).toEqual(expect.arrayContaining(['/events/new', '/circles/new', '/nearby', '/messages', '/network']))
  })

  it('treats a visitor preview (null role) as a member rather than rendering nothing', async () => {
    await mount(null)
    await press()
    expect(hrefs()).toContain('/events/new')
  })

  it('the Post row is the Zap menu door: it dispatches open-capture on the post mode and closes', async () => {
    await mount('member')
    await press()
    const seen: unknown[] = []
    const onOpen = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener('open-capture', onOpen)
    const post = Array.from(sheet()!.querySelectorAll('button')).find((b) => b.textContent?.includes('Post'))!
    await act(async () => {
      post.click()
      await Promise.resolve()
    })
    window.removeEventListener('open-capture', onOpen)
    expect(seen).toEqual([{ mode: 'post' }])
    expect(sheet()).toBeNull()
  })

  it('choosing a structured create closes the sheet', async () => {
    await mount('member')
    await press()
    const event = sheet()!.querySelector('a[href="/events/new"]') as HTMLAnchorElement
    await act(async () => {
      event.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(sheet()).toBeNull()
  })
})

describe('the shell wires the centre slot to this button', () => {
  const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
  // Comments stripped first: the shell's own comment explains that the button USED to fire the
  // event, and a word in a comment is not a dispatch.
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('mounts CreateButton in the mobile tab bar with the viewer role', () => {
    expect(code).toContain('<CreateButton role={viewer.role} />')
    expect(code).toContain("import { CreateButton } from '@/components/layout/create-button'")
  })

  it('no longer fires open-capture itself; that door is the Create sheet’s Post row', () => {
    // The dispatch must live in create-button.tsx and nowhere in the shell's own code.
    expect(code).not.toContain('open-capture')
    const centre = readFileSync('components/layout/create-button.tsx', 'utf8')
    expect(centre).toContain("new CustomEvent('open-capture', { detail: { mode: 'post' } })")
    // And the listener that answers it is still there, so the door opens onto something.
    const launcher = readFileSync('components/feed/capture-launcher.tsx', 'utf8')
    expect(launcher).toContain("window.addEventListener('open-capture', onOpen)")
  })
})
