// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BetaGraceNotice } from './beta-grace-notice'
import type { BetaNotice } from '@/lib/pricing/beta-notice'

// ADOPTION GUARD (PROG-DAWN2). The beta grace notice used to draw its own box: its own frame, its
// own glyph chip, its own dismiss control. It now composes the kit's GateNotice on the `preview`
// kind, which is the exact thing that kind is for (visible and free while billing is off).
//
// The assertion is the CONSEQUENCE, not the import: a rendered `[data-kind="preview"]` frame can
// only come from GateNotice, so a future rewrite that re-hand-rolls the box fails here even if it
// keeps the import. What it must keep on top of that is everything ADR-875 promised — three plain
// sentences, a way out, a way to put it away, and no wall.

const NOTICE: BetaNotice = {
  key: 'plan:collective',
  title: 'You are using Collective tools',
  body: 'Memberships start soon. Everything stays open until then.',
  invite: 'Take the yearly plan first and your Space keeps the Founding badge.',
  cta: 'See the plans',
  href: '/upgrade',
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

/** Mount and let the post-mount microtask that reveals the notice settle. */
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<BetaGraceNotice notice={NOTICE} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  return container!
}

describe('BetaGraceNotice composes the kit', () => {
  it('draws the GateNotice preview frame rather than a box of its own', async () => {
    const c = await mount()
    const notice = c.querySelector('[data-kind="preview"]')
    expect(notice).not.toBeNull()
    // The wrapper stays a note beside the win, never a wall (ADR-875).
    expect(c.querySelector('[role="note"]')).not.toBeNull()
    expect(c.querySelector('[role="dialog"]')).toBeNull()
  })

  it('says all three plain things, with the two body sentences as separate paragraphs', async () => {
    const c = await mount()
    const notice = c.querySelector('[data-kind="preview"]')!
    expect(notice.textContent).toContain(NOTICE.title)
    // Title, then the two body paragraphs, each its own block and none inside another.
    expect(notice.querySelector('p p')).toBeNull()
    const paras = Array.from(notice.querySelectorAll('p')).map((p) => p.textContent)
    expect(paras).toEqual([NOTICE.title, NOTICE.body, NOTICE.invite])
  })

  it('offers the door out through the kit action slot', async () => {
    const c = await mount()
    const link = c.querySelector('[data-kind="preview"] a') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toBe(NOTICE.cta)
    expect(link.getAttribute('href')).toBe(NOTICE.href)
  })

  it('can be put away, and stays away', async () => {
    const c = await mount()
    const button = c.querySelector('[data-kind="preview"] button[aria-label="Dismiss"]') as HTMLButtonElement
    expect(button).not.toBeNull()
    await act(async () => button.click())
    expect(c.querySelector('[data-kind="preview"]')).toBeNull()
    // And the choice is remembered, so the next success moment is quiet.
    expect(localStorage.getItem('fq_beta_notice_v1')).toContain(NOTICE.key)
  })
})
