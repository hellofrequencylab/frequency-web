'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Smile, Loader2, ArrowRight } from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { STUDIO_ACCENTS, accentColor, accentTint, DEFAULT_ACCENT, type AccentKey } from '@/lib/studio/accents'
import { isError } from '@/lib/action-result'
import { createJourney } from '@/app/(main)/journeys/actions'

const EMOJI_CHOICES = ['🧭','🌱','🔥','🧘','🏃','💪','📓','📖','🌊','☀️','🌙','✨','🎯','🫀','🧠','🎨','🎸','🛠️','🤝','🕊️','💧','🏔️','🌀','💫']

// The reusable "launch the Studio in place" entry point for journeys. Opens the
// familiar Studio window with a quick name-it step, then drops the creator into the
// full builder (deep-linked at /journeys/[slug]). The same pattern will front other
// entities (circle/practice/event) as their specs land.
export function NewJourneyButton({ className }: { className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [emoji, setEmoji] = useState('🧭')
  const [accent, setAccent] = useState<AccentKey>(DEFAULT_ACCENT)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    if (!title.trim()) { setError('Give your journey a name to begin.'); return }
    start(async () => {
      setError(null)
      const res = await createJourney({ title, summary, emoji, accent })
      if (isError(res)) { setError(res.error); return }
      router.push(`/journeys/${res.data.slug}`)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'}
      >
        <Plus className="h-4 w-4" /> New journey
      </button>

      <StudioWindow
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Studio · New journey"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-subtle">{error ? <span className="text-danger">{error}</span> : 'You can change everything after this.'}</span>
            <button
              type="button"
              onClick={create}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Start building
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          A journey is a life-development track you share with the community — from a single daily practice to a full course. Give it a name and a face; you’ll add the practices next.
        </p>

        <div className="mt-5 flex items-start gap-3">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
          >
            {emoji || <Smile className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create() }}
              maxLength={120}
              placeholder="Name your journey"
              className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
            />
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={280}
              placeholder="One line on what it is and who it’s for (optional)"
              className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
            />
          </div>
        </div>

        {/* Emoji choices */}
        <div className="mt-5">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Pick a face</p>
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-xl transition-transform hover:scale-110 ${emoji === e ? 'ring-2 ring-primary' : 'hover:bg-surface-elevated'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Accent */}
        <div className="mt-4">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Accent</p>
          <div className="flex gap-1.5">
            {STUDIO_ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-label={a.label}
                onClick={() => setAccent(a.key)}
                className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-canvas transition-transform hover:scale-110 ${accent === a.key ? 'ring-2' : ''}`}
                style={{ backgroundColor: accentColor(a.key), ['--tw-ring-color' as string]: accentColor(a.key) }}
              />
            ))}
          </div>
        </div>
      </StudioWindow>
    </>
  )
}
