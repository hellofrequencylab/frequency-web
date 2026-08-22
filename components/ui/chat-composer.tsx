'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

// The ONE message box. Every chat surface in the product — member DMs, rooms, the visitor
// live-chat widget, the operator bridge, the member support thread, the ticket reply — used to
// hand-roll its own, and the six of them agreed on nothing: `rows={1}` vs `rows={2}` vs `rows={3}`,
// `max-h-24` vs `max-h-32` vs no cap, Enter-to-send vs ⌘Enter-to-send vs button-only, three
// different send buttons, and a send hint on exactly one of them.
//
// 🔴 NONE OF THEM GREW. Every one shipped `rows={1} resize-none` with a `max-h-*`, which is a box
// that is permanently one line tall and scrolls its own text out of sight the moment you write a
// second sentence — you cannot see what you are about to send. The feed composer
// (components/feed/composer.tsx) has had the measure-and-grow effect for a long time; the chat
// boxes never got it. That is the "clunky" in the owner's report, and it is fixed here once
// rather than six times.
//
// Built ON the Textarea primitive (components/ui/field.tsx), not on a raw <textarea>, so the field
// chrome, the calm focus halo, the `aria-invalid` error look and the disabled fade all stay in the
// one place that owns them.

export type ChatComposerHandle = {
  /** Put the caret in the box. */
  focus: () => void
}

/** How a message is committed from the keyboard. */
export type SubmitKey =
  /** Enter sends, Shift+Enter is a newline. Live conversation — the default. */
  | 'enter'
  /** ⌘/Ctrl+Enter sends, Enter is a newline. For a long-form reply where paragraphs are normal. */
  | 'mod-enter'

const HINT: Record<SubmitKey, string> = {
  enter: 'Enter to send · Shift+Enter for a new line',
  'mod-enter': '⌘/Ctrl+Enter to send',
}

export function ChatComposer({
  value,
  onValueChange,
  onSend,
  placeholder = 'Message…',
  label,
  pending = false,
  disabled = false,
  error = null,
  submitKey = 'enter',
  showHint = true,
  onKeyDown: onKeyDownExtra,
  autoFocus = false,
  minRows = 1,
  maxHeight = 160,
  leading,
  trailing,
  footer,
  className,
  handleRef,
}: {
  value: string
  onValueChange: (next: string) => void
  /** Commit. The composer never clears the value itself — the caller owns the draft, so a
   *  failed send can put the text back instead of losing it. */
  onSend: () => void
  placeholder?: string
  /** Accessible name for the box. Required: a composer with no label announces as "edit text, blank". */
  label: string
  pending?: boolean
  disabled?: boolean
  error?: string | null
  submitKey?: SubmitKey
  /** Extra key handling, run BEFORE the send key. Call `preventDefault()` to swallow the key
   *  (the room composer closes itself on Escape this way). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  showHint?: boolean
  autoFocus?: boolean
  minRows?: number
  /** Ceiling in px for the auto-grow. Past it the box scrolls internally (contained). */
  maxHeight?: number
  /** Controls to the LEFT of the box (an attach button, a kind chip). */
  leading?: ReactNode
  /** Controls between the box and Send. */
  trailing?: ReactNode
  /** A line under the row — a hint, a chip strip, a character count. Replaces the default hint. */
  footer?: ReactNode
  className?: string
  handleRef?: Ref<ChatComposerHandle>
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useImperativeHandle(handleRef, () => ({ focus: () => taRef.current?.focus() }), [])

  // Grow to fit what has been typed, capped. Measure from `auto` first: scrollHeight is only the
  // CONTENT height when the box is not already stretched to hold it, so skipping the reset makes
  // the box grow monotonically and never shrink back after a delete.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [value, maxHeight])

  // Focus on a programmatic open, but never on a coarse pointer: raising the phone keyboard over
  // a conversation the member has not read yet costs more than the one tap it saves.
  useEffect(() => {
    if (!autoFocus) return
    if (typeof window !== 'undefined' && !window.matchMedia?.('(pointer: fine)').matches) return
    taRef.current?.focus()
  }, [autoFocus])

  const canSend = value.trim().length > 0 && !pending && !disabled

  const submit = useCallback(() => {
    if (!canSend) return
    onSend()
  }, [canSend, onSend])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDownExtra?.(e)
      if (e.defaultPrevented) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key !== 'Enter') return
      if (submitKey === 'enter' ? !e.shiftKey && !mod : mod) {
        e.preventDefault()
        submit()
      }
    },
    [submitKey, submit, onKeyDownExtra],
  )

  return (
    <div className={cn('shrink-0', className)}>
      {error && (
        <p role="alert" className="mb-1.5 text-meta text-danger">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        {leading}
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          rows={minRows}
          disabled={disabled}
          // `overscroll-contain`: once the box is at its cap and scrolling its own text, a flick
          // that reaches the end must not hand the rest of the gesture to the page behind it.
          className="flex-1 resize-none overscroll-contain leading-relaxed"
          style={{ maxHeight }}
        />
        {trailing}
        <IconButton
          label="Send"
          variant="filled"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
      </div>
      {footer ?? (showHint && <p className="mt-1.5 text-right text-3xs text-muted">{HINT[submitKey]}</p>)}
    </div>
  )
}
