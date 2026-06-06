'use client'

import { useState } from 'react'
import { PenLine, NotebookPen, Camera, UserPlus } from 'lucide-react'
import { Composer } from './composer'
import { ContactCaptureForm } from './contact-capture-form'

// The Capture box — one Substack-style box, multiple modes (the rework). The body
// swaps by mode; a bottom rail of prompts picks what you're capturing; the send
// button always says "Capture". Posts/notes/photos ride the composer; Contact is
// the headline — drop a person straight into your personal CRM (ADR-155/156).
//   On web this box is the modal post box. On mobile the same box opens from the
//   centre-nav Capture button, contact-forward (you're out meeting people).

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

  return (
    <div className="space-y-2">
      {mode === 'contact' ? (
        <div className="rounded-2xl border border-border bg-surface">
          <ContactCaptureForm />
        </div>
      ) : (
        <Composer
          key={mode}
          scopeId={scopeId}
          visibility={visibility}
          canAnnounce={canAnnounce}
          kind={mode === 'note' ? 'note' : 'post'}
          autoImage={mode === 'photo'}
          placeholder={mode === 'note' ? 'Jot a note — what happened, what you noticed…' : placeholder}
          submitLabel="Capture"
        />
      )}

      {/* Bottom rail — the "what are you capturing?" prompts. */}
      <div className="flex items-center gap-1 px-1">
        <span className="mr-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Capture</span>
        {MODES.map((m) => {
          const active = mode === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                active ? 'bg-broadcast text-on-broadcast' : 'text-subtle hover:bg-surface-elevated hover:text-text'
              }`}
            >
              <m.icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
