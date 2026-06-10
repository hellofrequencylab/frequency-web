'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, ArrowRight } from 'lucide-react'
import { StudioLaunchButton } from '../kit/studio-launch-button'
import { IconAccentFace, AccentPicker, IconGrid } from '../kit/studio-identity'
import { StudioFooter } from '../kit/studio-footer'
import { StudioSectionLabel } from '../kit/studio-field'
import { DEFAULT_ACCENT, type AccentKey } from '@/lib/studio/accents'
import { isError } from '@/lib/action-result'
import { createJourney } from '@/app/(main)/journeys/actions'

// The journey "launch the Studio in place" entry point — now composed from the kit
// (StudioLaunchButton + identity atoms + footer). The same pattern fronts other
// entities once their builders land (docs/STUDIO.md §2).
export function NewJourneyButton({ className }: { className?: string }) {
  const router = useRouter()
  const [icon, setIcon] = useState('compass')
  const [accent, setAccent] = useState<AccentKey>(DEFAULT_ACCENT)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    if (!title.trim()) { setError('Give your journey a name to begin.'); return }
    start(async () => {
      setError(null)
      const res = await createJourney({ title, summary, emoji: icon, accent })
      if (isError(res)) { setError(res.error); return }
      router.push(`/journeys/${res.data.slug}`)
    })
  }

  return (
    <StudioLaunchButton
      label="New journey"
      icon={Plus}
      className={className}
      eyebrow="Studio · New journey"
      footer={
        <StudioFooter
          left={
            <span className="text-xs text-subtle">
              {error ? <span className="text-danger">{error}</span> : 'You can change everything after this.'}
            </span>
          }
        >
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Start building
          </button>
        </StudioFooter>
      }
    >
      <p className="text-sm text-muted">
        A journey is a life-development track you share with the community — from a single daily practice to a full course. Give it a name and a face; you’ll add the practices next.
      </p>

      <div className="mt-5 flex items-start gap-3">
        <IconAccentFace icon={icon} accent={accent} size="lg" />
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

      <div className="mt-5">
        <StudioSectionLabel className="mb-1.5">Pick a face</StudioSectionLabel>
        <IconGrid value={icon} onPick={setIcon} />
      </div>

      <div className="mt-4">
        <StudioSectionLabel className="mb-1.5">Accent</StudioSectionLabel>
        <AccentPicker accent={accent} onChange={(a) => setAccent(a as AccentKey)} size="lg" />
      </div>
    </StudioLaunchButton>
  )
}
