'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BETA_CTA_HREF } from '@/lib/site'
import { FEED_PREVIEW_MS, anonFeedHrefAllowed } from '@/lib/feed/join-gate'
import { JoinPrompt } from '../join-prompt'

// THE JOIN OVERLAY ON THE ANONYMOUS FEED (SCAN-889; owner, 2026-10-14: "The pop up is a full screen
// overlay with the Join box in the middle"). Mounted by app/(main)/layout.tsx around the real member
// shell when a signed-out visitor reads /feed as Anonymous (lib/nav/anon-feed.ts).
//
// It opens FEED_PREVIEW_MS after this page load (no clock carried across a reload), and at once on any
// account-only action. Account-only is decided in one place, before any component's own handler can run:
// a capture-phase listener on the window sees every click first, so a button (post, like, reply, RSVP, a
// rail or header control), a field (the composer, a reply box), a form submit, or a link to anywhere but
// the public site (lib/feed/join-gate.ts anonFeedHrefAllowed: the viewer's own profile, any member page)
// is stopped and opens this instead. No component below needs to know it is being read anonymously.
//
// Full screen: a modal <dialog> sized to the viewport, the Feed behind it dimmed and blurred and inert,
// the Join box centred. It does not close on Escape or a backdrop click; the ways on are Join free, Log
// in, or Back to Home.

/** Clickable things a visitor could act through. A link is judged by its href; the rest are account-only. */
const ACTIONABLE = 'a[href],button,[role="button"],[role="menuitem"],[role="tab"],input,select,textarea,label,summary'

export function AnonJoinGate() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const show = useCallback(() => setOpen(true), [])

  useEffect(() => {
    const timer = window.setTimeout(show, FEED_PREVIEW_MS)
    const inGate = (t: EventTarget | null) => t instanceof Node && !!dialog.current?.contains(t)
    const stop = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      show()
    }
    const onClick = (e: MouseEvent) => {
      if (inGate(e.target)) return
      const el = e.target instanceof Element ? e.target.closest(ACTIONABLE) : null
      if (!el) return
      const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null
      if (!href || !anonFeedHrefAllowed(href, window.location.origin)) return stop(e)
      // The Feed's own links (its sort lens, the logo, an in-page anchor) stay client moves. Anywhere else
      // on the public site is a full load: a client move keeps this layout, so the page would arrive
      // inside the anonymous member shell instead of the public chrome it renders in on its own.
      const url = new URL(href, window.location.origin)
      if (href.startsWith('#') || url.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      window.location.assign(url.href)
    }
    const onFocus = (e: FocusEvent) => {
      if (inGate(e.target)) return
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable)) {
        el.blur()
        show()
      }
    }
    const onSubmit = (e: Event) => {
      if (!inGate(e.target)) stop(e)
    }
    // ⌘K opens member search, which needs an account.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') stop(e)
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('focusin', onFocus, true)
    window.addEventListener('submit', onSubmit, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('focusin', onFocus, true)
      window.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [show])

  return (
    <JoinPrompt
      open={open}
      dialogRef={dialog}
      title={<>Join the <span className="serif">movement.</span></>}
      joinHref={BETA_CTA_HREF}
      joinLabel="Join the movement"
      secondary={<Link href="/about" className="btn lg">Find out more</Link>}
      loginHref="/sign-in?next=%2Ffeed"
      footer={<Link href="/" className="btn txt sm fqm-join-home">Back to Home</Link>}
    >
      Real-life community is growing across North County: local Circles, events and daily practices with people
      who show up. Join free while we’re in beta.
    </JoinPrompt>
  )
}
