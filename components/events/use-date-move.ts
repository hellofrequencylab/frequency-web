'use client'

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { keyboardMoveDelta, planEntryMove, shiftDayKey, type EntryMove } from '@/lib/calendar/date-move'
import type { CalendarEvent } from '@/lib/calendar/item'

// PICKING A DATE UP (PROG-CAL15). The hands half of moving a date: which chip is in hand, which day
// cell is under it, and when a gesture becomes a move. Every decision about whether that move is
// allowed lives in lib/calendar/date-move.ts, which is pure and tested on its own; this file only
// turns pointers, touches and keys into a call to it.
//
// THREE WAYS IN, ONE WAY OUT. A mouse drags with the browser's own drag and drop, a touch picks the
// chip up with a long press and carries it (a touch drag never fires dragenter on anything but the
// element it started on, so the day under the finger is read from the point instead), and a
// keyboard moves the focused chip with Shift and an arrow. All three end in `plan()`, so a refusal
// reads the same sentence whichever hand made it.
//
// IT IS OFF UNLESS A HOST ASKS. `onMove` absent (the Space page's calendar, the guest calendar, a
// viewer who cannot edit) means no chip is draggable and no key moves anything: the page calendar
// stays click-to-open, which is the ruling this row was written under.

/** How long a finger rests on a chip before it is carrying it. Long enough not to fire on a tap or
 *  the start of a scroll, short enough that a person is not left wondering (450ms, the press the
 *  platform long-press menus use). */
const LONG_PRESS_MS = 450

/** How far a finger may wander during that press and still be resting rather than scrolling. A
 *  press held perfectly still is not a thing a hand does. */
const LONG_PRESS_SLOP_PX = 12

/** The attribute a day cell carries so a carried chip can find the day under the finger. */
export const DAY_CELL_ATTR = 'data-day-cell'

export interface DateMoveHandlers {
  /** False when no host asked for moving: nothing below does anything. */
  enabled: boolean
  /** The day cell currently under the pointer, drawn as the drop target. */
  dropDay: string | null
  /** The item key of the chip in hand, or null. */
  carrying: string | null
  startDrag: (e: DragEvent<HTMLElement>, item: CalendarEvent, key: string) => void
  endDrag: () => void
  overDay: (e: DragEvent<HTMLElement>, dayKey: string) => void
  leaveDay: (e: DragEvent<HTMLElement>, dayKey: string) => void
  dropOnDay: (e: DragEvent<HTMLElement>, dayKey: string) => void
  pressChip: (e: PointerEvent<HTMLElement>, item: CalendarEvent, key: string) => void
  chipKeyDown: (e: KeyboardEvent<HTMLElement>, item: CalendarEvent) => void
}

export function useDateMove(
  onMove: ((move: EntryMove) => void) | undefined,
  shownMonth: { year: number; month1: number },
  /** The grid root, so a chip that moved can be found again and kept under focus. */
  rootRef: RefObject<HTMLElement | null>,
  /** Changes whenever the items on the grid do: when it changes, a moved chip is re-focused. */
  itemsEpoch: unknown,
): DateMoveHandlers {
  const enabled = !!onMove
  const [dropDay, setDropDay] = useState<string | null>(null)
  const [carrying, setCarrying] = useState<string | null>(null)
  // The chip a touch is carrying, read inside window listeners that outlive a render.
  const carried = useRef<CalendarEvent | null>(null)
  const pressTimer = useRef<number | null>(null)
  const releaseTouch = useRef<(() => void) | null>(null)
  // The entry id of the last date this grid moved. The chip for it unmounts from one cell and mounts
  // in another when the month comes back from the server, which would drop focus to the body in the
  // middle of a keyboard move (LIVE-469: focus never falls to the body). One re-focus per move.
  const movedId = useRef<string | null>(null)
  const { year, month1 } = shownMonth

  const reset = useCallback(() => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
    releaseTouch.current?.()
    releaseTouch.current = null
    carried.current = null
    setCarrying(null)
    setDropDay(null)
  }, [])

  const plan = useCallback((item: CalendarEvent, toDayKey: string) => {
    const move = planEntryMove(item, toDayKey, { year, month1 })
    if (move.ok) movedId.current = move.entryId
    onMove?.(move)
  }, [onMove, year, month1])

  // Everything a hand is holding is let go when this grid goes away.
  useEffect(() => reset, [reset])

  // ESC PUTS IT BACK. The browser cancels its own drag on Esc, but a carried touch and the drop
  // target highlight are ours, and so is the console's Esc, which would otherwise close the whole
  // console out from under a half-finished move. Capture, and stop there: while something is in
  // hand, Esc means "put it back" and nothing else.
  useEffect(() => {
    if (!carrying && !dropDay) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      reset()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [carrying, dropDay, reset])

  // The moved chip, found again in its new cell once the month has come back.
  useEffect(() => {
    const id = movedId.current
    if (!id) return
    movedId.current = null
    const root = rootRef.current
    if (!root) return
    const active = document.activeElement
    // Only take focus back if nothing else has claimed it since.
    if (active && active !== document.body && !root.contains(active)) return
    root.querySelector<HTMLElement>(`[data-move-chip="${id}"]`)?.focus()
  }, [itemsEpoch, rootRef])

  const startDrag = useCallback((e: DragEvent<HTMLElement>, item: CalendarEvent, key: string) => {
    if (!enabled) return
    carried.current = item
    setCarrying(key)
    const dt = e.dataTransfer
    if (!dt) return
    dt.effectAllowed = 'move'
    // Some text, because a drag with an empty payload is cancelled on the spot in Firefox.
    try {
      dt.setData('text/plain', item.title)
    } catch {
      // A browser that will not take the payload still drags; the item is held in `carried`.
    }
  }, [enabled])

  const endDrag = useCallback(() => reset(), [reset])

  const overDay = useCallback((e: DragEvent<HTMLElement>, dayKey: string) => {
    if (!enabled || !carried.current) return
    // Without this the browser never fires a drop on the cell at all.
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    setDropDay((cur) => (cur === dayKey ? cur : dayKey))
  }, [enabled])

  const leaveDay = useCallback((_e: DragEvent<HTMLElement>, dayKey: string) => {
    setDropDay((cur) => (cur === dayKey ? null : cur))
  }, [])

  const dropOnDay = useCallback((e: DragEvent<HTMLElement>, dayKey: string) => {
    if (!enabled) return
    e.preventDefault()
    const item = carried.current
    reset()
    if (item) plan(item, dayKey)
  }, [enabled, plan, reset])

  /** The day cell under a point, for a touch, which reports no dragenter of its own. */
  const dayAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)
    const cell = el && typeof el.closest === 'function' ? el.closest(`[${DAY_CELL_ATTR}]`) : null
    return cell?.getAttribute(DAY_CELL_ATTR) ?? null
  }

  const pressChip = useCallback((e: PointerEvent<HTMLElement>, item: CalendarEvent, key: string) => {
    if (!enabled || e.pointerType !== 'touch') return
    const from = { x: e.clientX, y: e.clientY }
    const onPointerMove = (m: globalThis.PointerEvent) => {
      if (!carried.current) {
        // Travelled before the press landed: this is a scroll or a swipe, not a pick-up. A hand
        // that merely wobbled is still resting, so it keeps its press.
        if (Math.abs(m.clientX - from.x) > LONG_PRESS_SLOP_PX || Math.abs(m.clientY - from.y) > LONG_PRESS_SLOP_PX) reset()
        return
      }
      m.preventDefault()
      setDropDay(dayAt(m.clientX, m.clientY))
    }
    const onPointerUp = (m: globalThis.PointerEvent) => {
      const held = carried.current
      const day = held ? dayAt(m.clientX, m.clientY) : null
      reset()
      if (held && day) plan(held, day)
    }
    const stop = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', stop)
    }
    releaseTouch.current = stop
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', stop)
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      carried.current = item
      setCarrying(key)
      setDropDay(item.dayKey)
    }, LONG_PRESS_MS)
  }, [enabled, plan, reset])

  const chipKeyDown = useCallback((e: KeyboardEvent<HTMLElement>, item: CalendarEvent) => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return
    const delta = keyboardMoveDelta(e.key, e.shiftKey)
    if (delta === null) return
    const to = shiftDayKey(item.dayKey, delta)
    if (!to) return
    // The console pages the month on a bare arrow and the grid steps one on its own: a move is this
    // chip's, and stops here.
    e.preventDefault()
    e.stopPropagation()
    plan(item, to)
  }, [enabled, plan])

  return { enabled, dropDay, carrying, startDrag, endDrag, overDay, leaveDay, dropOnDay, pressChip, chipKeyDown }
}
