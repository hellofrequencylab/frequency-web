'use client'

import { useState } from 'react'
import { PenLine, NotebookPen, Camera, UserPlus } from 'lucide-react'
import { Composer } from './composer'
import { ContactCaptureForm } from './contact-capture-form'

// The Capture box — one Substack-style box, multiple modes (the rework). The mode
// tabs live INSIDE the box (top), the active one filled so it's always obvious what
// you're capturing; the body + send button below match the mode. Posts/notes/photos
// ride the composer; Contact drops a person straight into the personal CRM (ADR-155/156).

type Mode = 'post' | 'note' | 'photo' | 'contact'

const MODES: { key: Mode; icon: typeof PenLine; label: string }[] = [
  { key: 'post', icon: PenLine, label: 'Post' },
  { key: 'note', icon: NotebookPen, label: 'Note' },
  { key: 'photo', icon: Camera, label: 'Photo' },
  { key: 'contact', icon: UserPlus, label: 'Contact' },
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

  // The mode tabs — rendered inside the box (top). Active = filled, so the current
  // mode is unmistakable.
  const tabs = (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1.5 text-2xs font-bold uppercase tracking-wide text-subtle">Capture</span>
      {MODES.map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              active
                ? 'bg-broadcast text-on-broadcast shadow-sm'
                : 'text-subtle hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
          </button>
        )
      })}
    </div>
  )

  if (mode === 'contact') {
    return (
      <div className="rounded-2xl bg-surface p-4 shadow-md">
        <div className="-mx-4 mb-3 border-b border-border px-4 pb-3">{tabs}</div>
        <ContactCaptureForm />
      </div>
    )
  }

  return (
    <Composer
      key={mode}
      scopeId={scopeId}
      visibility={visibility}
      canAnnounce={canAnnounce}
      kind={mode === 'note' ? 'note' : 'post'}
      autoImage={mode === 'photo'}
      placeholder={mode === 'note' ? 'Jot a note — what happened, what you noticed…' : placeholder}
      submitLabel="Capture"
      topSlot={tabs}
    />
  )
}
