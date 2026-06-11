'use client'

import { useRef, useState } from 'react'
import { PenLine, Megaphone, NotebookPen, UserPlus, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateMyAvatar } from '@/app/(main)/feed/actions'
import { Composer } from './composer'
import { ContactCaptureForm } from './contact-capture-form'

// The Capture box — one Substack-style box, one **bottom row of selectable capture
// features** (the rework): Post · Dispatch · Note · Connect, an icon segmented control
// alongside the send button. Each selector shows just its icon until it's the active
// mode, when it reveals its label — so the row stays compact on a phone and the
// current mode reads at a glance. The active feature drives the editor + send
// behaviour; Dispatch (host announcement) is just one of the features. (Photo is
// reached through the full-screen Capture's camera, not this inline row.)

type Mode = 'post' | 'dispatch' | 'note' | 'photo' | 'contact'

const MODES: { key: Mode; icon: typeof PenLine; label: string; hostOnly?: boolean }[] = [
  { key: 'post', icon: PenLine, label: 'Post' },
  { key: 'photo', icon: Camera, label: 'Photo' },
  { key: 'note', icon: NotebookPen, label: 'Note' },
  { key: 'contact', icon: UserPlus, label: 'Connect' },
  { key: 'dispatch', icon: Megaphone, label: 'Dispatch', hostOnly: true },
]

export function CaptureBox({
  scopeId,
  visibility = 'group',
  placeholder = 'What’s on your mind?',
  canAnnounce = false,
  defaultMode = 'post',
  compactTools = true,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
  /** Mobile/contact-forward surfaces can open straight into 'contact'. */
  defaultMode?: Mode
  /** Fold the composer's formatting tools behind a "Format" toggle (default —
   *  this default must match the Composer's, or it silently overrides it). */
  compactTools?: boolean
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
            aria-label={m.label}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold transition-colors ${
              active
                ? `bg-surface shadow-sm ${m.key === 'dispatch' ? 'text-warning' : 'text-primary-strong'}`
                : 'text-subtle hover:text-muted'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" />
            {/* Reveal the label only for the active mode — icon-only otherwise. */}
            {active && <span>{m.label}</span>}
          </button>
        )
      })}
    </div>
  )

  if (mode === 'contact') {
    return (
      <div className="rounded-2xl bg-surface p-4 shadow-md">
        <ContactCaptureForm />
        <TakeProfilePic />
        <div className="mt-3 border-t border-border pt-3">{featureRow}</div>
      </div>
    )
  }

  return (
    <Composer
      key={mode}
      scopeId={scopeId}
      compactTools={compactTools}
      visibility={visibility}
      kind={mode === 'note' ? 'note' : 'post'}
      autoImage={mode === 'photo'}
      forceAnnouncement={mode === 'dispatch'}
      bottomSlot={featureRow}
      placeholder={mode === 'note' ? 'Jot a note: what happened, what you noticed…' : placeholder}
      submitLabel="Capture"
    />
  )
}

// "Take a profile pic" inside the Connect feature: front camera straight to your
// avatar — same storage path the onboarding upload uses (avatars/<uid>/avatar.ext),
// persisted through the updateMyAvatar action. Quiet failure copy; never blocks.
function TakeProfilePic() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setState('saving')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('not signed in')
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await updateMyAvatar(publicUrl)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => void onSelect(e)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === 'saving'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
      >
        <Camera className="h-3.5 w-3.5" />
        {state === 'saving'
          ? 'Saving…'
          : state === 'done'
            ? 'Profile pic updated'
            : 'Take a profile pic'}
      </button>
      {state === 'error' && (
        <p className="mt-1 text-2xs text-danger">That didn’t save. Try again, or set it in Settings.</p>
      )}
    </div>
  )
}
