'use client'

import { useState } from 'react'
import { PenLine, Megaphone, NotebookPen, Camera, UserPlus } from 'lucide-react'
import { Composer } from './composer'
import { ContactCaptureForm } from './contact-capture-form'

// The Capture box — one Substack-style box, one **bottom row of selectable capture
// features** (the rework): Post · Dispatch · Note · Photo · Contact, displayed as a
// single segmented control alongside the send button. The active feature drives the
// editor + send behaviour; Dispatch (host announcement) is just one of the features.

type Mode = 'post' | 'dispatch' | 'note' | 'photo' | 'contact'

const MODES: { key: Mode; icon: typeof PenLine; label: string; hostOnly?: boolean }[] = [
  { key: 'contact', icon: UserPlus, label: 'Connect' },
  { key: 'post', icon: PenLine, label: 'Post' },
  { key: 'dispatch', icon: Megaphone, label: 'Dispatch', hostOnly: true },
  { key: 'note', icon: NotebookPen, label: 'Note' },
  { key: 'photo', icon: Camera, label: 'Photo' },
]

export function CaptureBox({
  scopeId,
  visibility = 'group',
  placeholder = 'What’s on your mind?',
  canAnnounce = false,
  defaultMode = 'post',
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
  /** Mobile/contact-forward surfaces can open straight into 'contact'. */
  defaultMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const modes = MODES.filter((m) => !m.hostOnly || canAnnounce)

  // One row of selectable capture features — never wraps; scrolls if it must.
  const featureRow = (
    <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-elevated p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {modes.map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={active}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold transition-colors ${
              active
                ? `bg-surface shadow-sm ${m.key === 'dispatch' ? 'text-warning' : 'text-primary-strong'}`
                : 'text-subtle hover:text-muted'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" /> {m.label}
          </button>
        )
      })}
    </div>
  )

  if (mode === 'contact') {
    return (
      <div className="rounded-2xl bg-surface p-4 shadow-md">
        <ContactCaptureForm />
        <div className="mt-3 border-t border-border pt-3">{featureRow}</div>
      </div>
    )
  }

  return (
    <Composer
      key={mode}
      scopeId={scopeId}
      visibility={visibility}
      kind={mode === 'note' ? 'note' : 'post'}
      autoImage={mode === 'photo'}
      forceAnnouncement={mode === 'dispatch'}
      bottomSlot={featureRow}
      placeholder={mode === 'note' ? 'Jot a note — what happened, what you noticed…' : placeholder}
      submitLabel="Capture"
    />
  )
}
