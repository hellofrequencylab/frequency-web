'use client'

// Journeys v2 — advanced author settings (ADR-252): the discovery-page layout and the
// official-program flag. Split out from the main Settings panel because both are optional and
// role/edge-case shaped. NOTE: page_config now governs only the DISCOVERY (not-adopted) face —
// the season "active" widgets it used to configure were retired in the J5 cutover, so only the
// live discovery widgets are surfaced here. Reuses the owner-checked plan actions.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Eye, EyeOff, Sparkles, Layout, CalendarRange } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { loadJourneyOfficialContext, setJourneyOfficial, setJourneyPageConfig, setJourneyWindow } from '@/app/(main)/journeys/actions'
import { editorPageConfig, WIDGET_META, REQUIRED_WIDGETS } from '@/lib/journey-page-config'
import type { PageWidgetConfig } from '@/lib/journey-plans'

interface Props {
  planId: string
  initialPageConfig: PageWidgetConfig[] | null
  initialOfficial: boolean
  initialQuestId: string | null
  /** Quest play-window (ISO yyyy-mm-dd), or null = always open. */
  initialWindowStartsAt: string | null
  initialWindowEndsAt: string | null
}

/** A stored ISO timestamp/date → the yyyy-mm-dd a <input type="date"> expects. */
function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

const DISCOVERY_REQUIRED = new Set<string>(REQUIRED_WIDGETS.discovery)

export function JourneyAdvanced({
  planId,
  initialPageConfig,
  initialOfficial,
  initialQuestId,
  initialWindowStartsAt,
  initialWindowEndsAt,
}: Props) {
  const router = useRouter()
  const [, start] = useTransition()
  const save = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  // ── Discovery-page layout (toggle + reorder the live discovery widgets) ──
  const [disc, setDisc] = useState<{ id: string; enabled: boolean }[]>(() =>
    editorPageConfig(initialPageConfig)
      .filter((c) => WIDGET_META[c.id as keyof typeof WIDGET_META]?.mode === 'discovery')
      .map((c) => ({ id: c.id, enabled: c.enabled })),
  )
  const persist = (next: { id: string; enabled: boolean }[]) => {
    setDisc(next)
    save(() => setJourneyPageConfig(planId, next as PageWidgetConfig[]))
  }
  const toggle = (id: string) => {
    if (DISCOVERY_REQUIRED.has(id)) return
    persist(disc.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)))
  }
  const move = (id: string, dir: -1 | 1) => {
    const i = disc.findIndex((d) => d.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= disc.length) return
    const next = [...disc]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }

  // ── Official program (Guide/Mentor only). Lazy-loaded role + quests. ──
  const [canOfficial, setCanOfficial] = useState(false)
  const [quests, setQuests] = useState<{ id: string; name: string; emoji: string | null }[]>([])
  const [official, setOfficial] = useState(initialOfficial)
  const [questId, setQuestId] = useState<string | null>(initialQuestId)

  useEffect(() => {
    let live = true
    void loadJourneyOfficialContext(planId).then((res) => {
      if (!live || isError(res)) return
      setCanOfficial(res.data.canMakeOfficial)
      setQuests(res.data.quests)
    })
    return () => {
      live = false
    }
  }, [planId])

  const saveOfficial = (next: { official: boolean; questId?: string | null }) => {
    if (next.official !== undefined) setOfficial(next.official)
    if (next.questId !== undefined) setQuestId(next.questId)
    save(() => setJourneyOfficial(planId, next))
  }

  // ── Quest play-window (Guide/Mentor only; same role gate as Official). Either
  //    bound may be empty (always-open / no-close). End must be on or after start —
  //    validated inline as you type, and we only persist a valid (or cleared) span. ──
  const [windowStart, setWindowStart] = useState(toDateInput(initialWindowStartsAt))
  const [windowEnd, setWindowEnd] = useState(toDateInput(initialWindowEndsAt))
  const windowInvalid = !!windowStart && !!windowEnd && windowEnd < windowStart

  const saveWindowStart = (value: string) => {
    setWindowStart(value)
    // Don't write an inverted span; if the new start passes the end, hold the save
    // until the end is fixed (the inline message points the way).
    if (value && windowEnd && windowEnd < value) return
    save(() => setJourneyWindow(planId, { startsAt: value || null }))
  }
  const saveWindowEnd = (value: string) => {
    setWindowEnd(value)
    if (value && windowStart && value < windowStart) return
    save(() => setJourneyWindow(planId, { endsAt: value || null }))
  }

  return (
    <details className="group space-y-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-base font-bold text-text">
          <Layout className="h-4 w-4 text-subtle" /> Advanced
          <span className="text-sm font-normal text-subtle">· discovery layout{canOfficial ? ' · official program' : ''}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="space-y-5">
        {/* Discovery-page layout */}
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Discovery page</p>
          <p className="mt-0.5 text-xs text-muted">What visitors see before they start. Toggle and reorder the blocks.</p>
          <ul className="mt-2 space-y-1">
            {disc.map((d, i) => {
              const meta = WIDGET_META[d.id as keyof typeof WIDGET_META]
              const required = DISCOVERY_REQUIRED.has(d.id)
              return (
                <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-2.5 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">{meta?.label ?? d.id}</span>
                    {meta?.hint && <span className="block truncate text-xs text-muted">{meta.hint}</span>}
                  </span>
                  <button type="button" onClick={() => move(d.id, -1)} disabled={i === 0} className="rounded p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(d.id, 1)} disabled={i === disc.length - 1} className="rounded p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button
                    type="button"
                    onClick={() => toggle(d.id)}
                    disabled={required}
                    className={`rounded p-1 ${d.enabled ? 'text-primary-strong' : 'text-subtle'} hover:text-text disabled:opacity-40`}
                    aria-label={d.enabled ? 'Hide' : 'Show'}
                    title={required ? 'Always shown' : d.enabled ? 'Shown' : 'Hidden'}
                  >
                    {d.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Official program (role-gated) */}
        {canOfficial && (
          <div className="border-t border-border pt-4">
            <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
              <Sparkles className="h-3.5 w-3.5" /> Official program
            </p>
            <p className="mt-0.5 text-xs text-muted">Flag this as an official Journey and link it to a Season.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => saveOfficial({ official: !official })}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  official ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-canvas text-muted hover:bg-surface-elevated'
                }`}
                aria-pressed={official}
              >
                <Sparkles className="h-4 w-4" /> {official ? 'Official' : 'Make official'}
              </button>
              {official && (
                <select
                  value={questId ?? ''}
                  onChange={(e) => saveOfficial({ official: true, questId: e.target.value || null })}
                  className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
                >
                  <option value="">No Season</option>
                  {quests.map((q) => (
                    <option key={q.id} value={q.id}>{q.emoji ? `${q.emoji} ` : ''}{q.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Play window — the ~4-week span that sequences a Season's Journeys */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <CalendarRange className="h-3.5 w-3.5" /> Play window
              </p>
              <p className="mt-0.5 text-xs text-muted">When this Journey is in play. Leave a date empty to keep it open.</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Opens</span>
                  <input
                    type="date"
                    value={windowStart}
                    max={windowEnd || undefined}
                    onChange={(e) => saveWindowStart(e.target.value)}
                    className="min-h-11 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Closes</span>
                  <input
                    type="date"
                    value={windowEnd}
                    min={windowStart || undefined}
                    onChange={(e) => saveWindowEnd(e.target.value)}
                    aria-invalid={windowInvalid}
                    className={`min-h-11 rounded-lg border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary ${
                      windowInvalid ? 'border-danger' : 'border-border'
                    }`}
                  />
                </label>
              </div>
              {windowInvalid && (
                <p className="mt-1.5 text-xs text-danger">The close date needs to be on or after the open date.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
