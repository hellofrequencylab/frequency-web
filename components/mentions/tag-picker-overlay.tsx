'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useTagPicker, type MentionPerson } from './use-tag-picker'

// THE PICKER FOR A COMPOSER IT DOES NOT OWN (LIVE-2525). The room composer (ChatComposer) is also
// drawn by the chat dock on every member page, so the picker is not built into it: the room page
// loads this overlay on demand (next/dynamic) and it attaches to the composer's textarea from the
// outside, through native listeners. A key it consumes is prevented at the textarea itself, before
// the composer's own Enter-to-send reads it (that handler checks defaultPrevented first).

export default function TagPickerOverlay({
  hostRef,
  value,
  onValueChange,
  people,
}: {
  /** An element that contains the composer's textarea. */
  hostRef: RefObject<HTMLElement | null>
  value: string
  onValueChange: (next: string) => void
  people: readonly MentionPerson[]
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const picker = useTagPicker({ inputRef, value, onValueChange, people })
  const latest = useRef(picker)
  useEffect(() => {
    latest.current = picker
  })

  useEffect(() => {
    const ta = hostRef.current?.querySelector('textarea') ?? null
    inputRef.current = ta
    if (!ta) return
    const onInput = () => latest.current.readCaret(ta.value)
    const onKey = (e: KeyboardEvent) => latest.current.onKeyDown(e)
    const onBlur = () => latest.current.onBlur()
    ta.addEventListener('input', onInput)
    ta.addEventListener('keydown', onKey)
    ta.addEventListener('blur', onBlur)
    return () => {
      ta.removeEventListener('input', onInput)
      ta.removeEventListener('keydown', onKey)
      ta.removeEventListener('blur', onBlur)
    }
  }, [hostRef])

  return picker.list
}
