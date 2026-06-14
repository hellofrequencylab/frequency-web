'use client'

// Journeys v2 — the author Settings panel (ADR-252, JOURNEYS.md §11). The single home for a
// Journey's identity, delivery, rewards, and publishing — the half of authoring that isn't the
// structure tree. Sits above <JourneyEditor> on /journeys/[slug]/edit and reuses the existing
// owner-checked plan actions (so the season Studio builder can retire). Autosaves: text on blur,
// toggles/selects on change; never blocks the editor.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine, Globe, Lock, Link2, Award, CalendarClock, Gem, PartyPopper } from 'lucide-react'
import { IconAccentFace, AccentPicker, IconGrid } from '@/components/studio/kit/studio-identity'
import { DEFAULT_ACCENT } from '@/lib/studio/accents'
import { isError } from '@/lib/action-result'
import { saveJourneyMeta, setJourneyRewards, setJourneyVisibility, setJourneyDelivery } from '@/app/(main)/journeys/actions'
import type { PlanStatus, PlanVisibility } from '@/lib/journey-plans'

export interface JourneySettingsProps {
  planId: string
  initialTitle: string
  initialSummary: string | null
  initialIntro: string | null
  initialEmoji: string | null
  initialAccent: string | null
  initialVisibility: PlanVisibility
  initialStatus: PlanStatus
  initialCompletionGems: number
  initialCertificateEnabled: boolean
  initialDripIntervalDays: number
}

export function JourneySettings(props: JourneySettingsProps) {
  const router = useRouter()
  const [, start] = useTransition()
  const save = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  const [icon, setIcon] = useState(props.initialEmoji ?? 'compass')
  const [accent, setAccent] = useState(props.initialAccent ?? DEFAULT_ACCENT)
  const [intro, setIntro] = useState(props.initialIntro ?? '')
  const [showIntro, setShowIntro] = useState(!!props.initialIntro)
  const [iconOpen, setIconOpen] = useState(false)

  const [gems, setGems] = useState(props.initialCompletionGems)
  const [certificate, setCertificate] = useState(props.initialCertificateEnabled)
  const [drip, setDrip] = useState(props.initialDripIntervalDays)

  const [visibility, setVisibility] = useState<PlanVisibility>(props.initialVisibility)
  const [status, setStatus] = useState<PlanStatus>(props.initialStatus)
  const [celebrate, setCelebrate] = useState<null | 'live' | 'review'>(null)

  const meta = (patch: Parameters<typeof saveJourneyMeta>[1]) => save(() => saveJourneyMeta(props.planId, patch))

  const changeVisibility = (v: PlanVisibility) => {
    const prev = visibility
    setVisibility(v)
    start(async () => {
      const res = await setJourneyVisibility(props.planId, v)
      if (isError(res)) {
        setVisibility(prev)
      } else {
        setStatus(res.data.status)
        if (v === 'public') {
          const live = res.data.status === 'approved'
          setCelebrate(live ? 'live' : 'review')
          setTimeout(() => setCelebrate(null), 3500)
        }
      }
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {celebrate === 'live' && (
        <div className="flex items-center gap-2 rounded-xl border border-success/50 bg-success-bg px-4 py-3 text-sm font-medium text-success">
          <PartyPopper className="h-5 w-5 shrink-0" /> Live in the community library. Anyone can adopt it now.
        </div>
      )}
      {celebrate === 'review' && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/50 bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <PartyPopper className="h-5 w-5 shrink-0" /> Submitted. A Guide reviews it, then it goes live in the library.
        </div>
      )}

      {/* Identity */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <IconAccentFace icon={icon} accent={accent} size="md" onClick={() => setIconOpen((v) => !v)} />
          {iconOpen && (
            <div className="absolute left-0 top-[3.25rem] z-10 w-64 rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <IconGrid value={icon} size="sm" onPick={(k) => { setIcon(k); setIconOpen(false); meta({ emoji: k }) }} />
            </div>
          )}
          <div className="mt-2 flex justify-center">
            <AccentPicker accent={accent} onChange={(a) => { setAccent(a); meta({ accent: a }) }} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <input
            defaultValue={props.initialTitle}
            onBlur={(e) => meta({ title: e.target.value })}
            maxLength={120}
            placeholder="Name your Journey"
            className="w-full bg-transparent text-xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            defaultValue={props.initialSummary ?? ''}
            onBlur={(e) => meta({ summary: e.target.value })}
            maxLength={280}
            placeholder="One line on what this is and who it's for"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      {/* Story / intro */}
      {showIntro || intro ? (
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          onBlur={(e) => meta({ intro: e.target.value })}
          rows={3}
          maxLength={8000}
          placeholder="The why, the how, what they'll get from it. A line, or a full curriculum."
          className="w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm leading-relaxed text-text outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowIntro(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:text-primary-hover"
        >
          <PencilLine className="h-4 w-4" /> Add the story behind it
        </button>
      )}

      {/* Delivery + rewards */}
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Gem className="h-3.5 w-3.5" /> Completion Gems
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={gems}
            onChange={(e) => setGems(Number(e.target.value))}
            onBlur={() => save(() => setJourneyRewards(props.planId, gems))}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <CalendarClock className="h-3.5 w-3.5" /> Phase drip (days)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={drip}
            onChange={(e) => setDrip(Number(e.target.value))}
            onBlur={() => save(() => setJourneyDelivery(props.planId, { dripIntervalDays: drip }))}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const next = !certificate
            setCertificate(next)
            save(() => setJourneyDelivery(props.planId, { certificateEnabled: next }))
          }}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            certificate ? 'border-rank-gold/50 bg-rank-gold/10 text-text' : 'border-border bg-canvas text-muted hover:bg-surface-elevated'
          }`}
          aria-pressed={certificate}
        >
          <span className="inline-flex items-center gap-1.5"><Award className="h-4 w-4 text-rank-gold" /> Certificate</span>
          <span className={`text-2xs font-semibold uppercase ${certificate ? 'text-rank-gold' : 'text-subtle'}`}>{certificate ? 'On' : 'Off'}</span>
        </button>
      </div>

      {/* Publish / visibility */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs">
        <span className="font-semibold uppercase tracking-wide text-subtle">Who can see it</span>
        {([
          ['private', Lock, 'Just me'],
          ['unlisted', Link2, 'Anyone with the link'],
          ['public', Globe, 'Community library'],
        ] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => changeVisibility(v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              visibility === v ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated'
            }`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        {visibility === 'public' && status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-1 text-warning">In review</span>
        )}
      </div>
    </section>
  )
}
