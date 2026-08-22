'use client'

import { useCallback, useEffect, useRef, type DependencyList } from 'react'

/**
 * Pin a chat transcript to its newest message — WITHOUT scrolling anything else.
 *
 * 🔴 WHY THIS EXISTS, and why `scrollIntoView` is the wrong tool for a transcript.
 *
 * Every chat surface in the product opened with the same four lines:
 *
 *     const endRef = useRef<HTMLDivElement>(null)
 *     useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
 *
 * That has two defects, and a member reported both of them as one bug ("when you scroll up to
 * read the beginning of the message, it instead scrolls the main page behind it up"):
 *
 *  1. `scrollIntoView` scrolls EVERY scrollable ancestor, up to and including the document.
 *     The dock is `position: fixed`, so the browser's idea of "bring this into view" is to
 *     scroll the PAGE UNDERNEATH the panel — the reported symptom, exactly. `block: 'nearest'`
 *     narrows it but still walks the ancestor chain. Setting `scrollTop` on the one container
 *     we mean cannot touch an ancestor at all, which is why that is what this does.
 *
 *  2. It fires unconditionally. Scroll up to re-read something, a message arrives (or a typing
 *     indicator mounts), and you are yanked back to the bottom mid-sentence. So the pin is
 *     CONDITIONAL: we stay pinned only while the reader is already at the bottom, and the
 *     moment they scroll away we stop moving the viewport until they come back.
 *
 * The container also needs `overscroll-contain` in its class list. This hook stops US from
 * scrolling the page; that class stops the BROWSER from chaining a wheel/touch flick to the
 * page once the transcript hits its end. They are different halves of the same complaint —
 * fixing one without the other leaves the bug reproducible.
 *
 * Usage:
 *
 *     const listRef = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])
 *     <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">…</div>
 *
 * Note it takes the SCROLL CONTAINER, not a sentinel <div> at the end — there is nothing to
 * scroll into view, so there is nothing to get wrong.
 */
export function useStickToBottom<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T | null>(null)
  // Start pinned: a transcript opens at its newest message.
  const pinnedRef = useRef(true)
  // First run jumps; later runs glide. Opening a thread should not animate a scroll the
  // member never asked for, and `smooth` on mount is also a race with layout settling.
  const mountedRef = useRef(false)

  // How close to the bottom still counts as "reading the live end". A couple of lines of
  // slack, so a half-scrolled wheel notch or an image finishing its layout does not unpin.
  const SLACK_PX = 48

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= SLACK_PX
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const first = !mountedRef.current
    mountedRef.current = true
    if (!first && !pinnedRef.current) return
    if (first) {
      el.scrollTop = el.scrollHeight
      return
    }
    // `scrollTo` on the element itself, so `behavior: 'smooth'` still cannot reach an ancestor.
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  /** Force the pin back on — call it right after the viewer sends, since sending IS an
   *  intent to see the bottom even if they were reading history a second ago. */
  const stickNow = useCallback(() => {
    pinnedRef.current = true
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  return { ref, stickNow }
}
