'use client'

import { useEffect, useRef, useState } from 'react'

// THE ON-CANVAS INLINE-EDITABLE TEXT SLOT for the WYSIWYG Space page editor. One lightweight
// `contentEditable` per text field on the live space canvas: click the text on the page and type right
// there (mirrors the Email Studio canvas slot, but PLAIN text so the stored value round-trips byte-for-byte
// through the space content sanitizer + the live ContentBlockView, which render authored copy as plain
// text). The slot is UNCONTROLLED after its first seed so the caret never jumps while typing; the parent
// keys it by block id + field key, so selecting another block remounts + re-seeds it. The store re-sanitizes
// on save, so this surface is a convenience, never a trust boundary. Semantic DAWN tokens, no hex.

export function SpaceEditableSlot({
  value,
  placeholder,
  multiline = false,
  className,
  onChange,
}: {
  /** The current stored text. Seeds the editor ONCE (uncontrolled after mount). */
  value: string
  /** The empty-state placeholder (the field label), so an empty slot names itself on the canvas. */
  placeholder: string
  /** A `textarea` field allows line breaks; a `text` field stays single-line (Enter is swallowed). */
  multiline?: boolean
  /** Typography classes matching the space look for this slot. */
  className?: string
  onChange: (next: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Always call the freshest onChange (the node is seeded once, so a captured callback would go stale).
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [empty, setEmpty] = useState(!value)

  // Seed the node's text ONCE on mount (uncontrolled thereafter). Re-seeding on every value change would
  // fight the caret; the parent remounts the slot (via key) when it needs a fresh seed.
  const seeded = useRef(false)
  useEffect(() => {
    if (ref.current && !seeded.current) {
      ref.current.textContent = value
      seeded.current = true
      setEmpty(!value)
    }
  }, [value])

  return (
    <div className="relative">
      {empty && (
        <span className="pointer-events-none absolute inset-0 select-none text-subtle opacity-70">
          {placeholder}
        </span>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-label={placeholder}
        aria-multiline={multiline}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        onInput={(e) => {
          const text = e.currentTarget.textContent ?? ''
          setEmpty(text.length === 0)
          onChangeRef.current(text)
        }}
        onKeyDown={(e) => {
          if (!multiline && e.key === 'Enter') e.preventDefault()
        }}
        className={`whitespace-pre-wrap break-words outline-none focus:outline-none ${className ?? ''}`}
      />
    </div>
  )
}
