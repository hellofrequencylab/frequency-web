'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, GripVertical, ChevronUp, ChevronDown, Clock, Search, Sparkles,
  Globe, Lock, Link2, Check, Loader2, Smile, PencilLine, PartyPopper, Eye,
} from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { STUDIO_ACCENTS, accentColor, accentTint, DEFAULT_ACCENT } from '@/lib/studio/accents'
import { isError } from '@/lib/action-result'
import {
  saveJourneyMeta, addPracticeToJourney, removeJourneyStep, reorderJourneySteps,
  setJourneyStep, setJourneyVisibility,
} from '@/app/(main)/journeys/actions'

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']
const EMOJI_CHOICES = ['🧭','🌱','🔥','🧘','🏃','💪','📓','📖','🌊','☀️','🌙','✨','🎯','🫀','🧠','🎨','🎸','🛠️','🤝','🕊️','💧','🏔️','🌀','💫']

export type Visibility = 'private' | 'unlisted' | 'public'

export interface BuilderItem {
  practiceId: string
  title: string
  description: string | null
  domainId: string | null
  note: string | null
  cadence: string | null
  practiceCadence: string | null
}
export interface AvailablePractice { id: string; title: string; description: string | null; domainId: string | null }
export interface PillarLite { id: string; slug: string; name: string }

interface Props {
  planId: string
  slug: string
  initialTitle: string
  initialSummary: string | null
  initialIntro: string | null
  initialEmoji: string | null
  initialAccent: string | null
  initialVisibility: Visibility
  initialItems: BuilderItem[]
  available: AvailablePractice[]
  pillars: PillarLite[]
  isCrew: boolean
}

type SaveState = 'idle' | 'saving' | 'saved'

export function JourneyBuilder(props: Props) {
  const router = useRouter()
  const close = useCallback(() => router.push('/journeys'), [router])

  // Identity (debounced autosave)
  const [emoji, setEmoji] = useState(props.initialEmoji ?? '')
  const [accent, setAccent] = useState(props.initialAccent ?? DEFAULT_ACCENT)
  const [title, setTitle] = useState(props.initialTitle)
  const [summary, setSummary] = useState(props.initialSummary ?? '')
  const [intro, setIntro] = useState(props.initialIntro ?? '')
  const [showIntro, setShowIntro] = useState(!!props.initialIntro)
  const [emojiOpen, setEmojiOpen] = useState(false)

  // Path
  const [items, setItems] = useState<BuilderItem[]>(props.initialItems)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(props.initialItems.length === 0)
  const [query, setQuery] = useState('')

  // Visibility + status
  const [visibility, setVisibility] = useState<Visibility>(props.initialVisibility)
  const [save, setSave] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flagSaved = useCallback(() => setSave('saved'), [])

  // Auto-revert the "Saved" badge back to idle (no ref needed in the save path).
  useEffect(() => {
    if (save !== 'saved') return
    const t = setTimeout(() => setSave('idle'), 1800)
    return () => clearTimeout(t)
  }, [save])

  // Persist helper for item ops (best-effort; resync from server on failure).
  const persist = useCallback(
    async (fn: () => Promise<{ data: unknown } | { error: string }>) => {
      setSave('saving')
      setError(null)
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        setSave('idle')
        router.refresh()
        return false
      }
      flagSaved()
      return true
    },
    [flagSaved, router],
  )

  // Debounced identity save.
  const queueMetaSave = useCallback(
    (patch: Parameters<typeof saveJourneyMeta>[1]) => {
      setSave('saving')
      if (metaTimer.current) clearTimeout(metaTimer.current)
      metaTimer.current = setTimeout(async () => {
        const res = await saveJourneyMeta(props.planId, patch)
        if (isError(res)) { setError(res.error); setSave('idle') } else flagSaved()
      }, 600)
    },
    [props.planId, flagSaved],
  )

  useEffect(() => () => {
    if (metaTimer.current) clearTimeout(metaTimer.current)
  }, [])

  // --- Item operations (optimistic) ---------------------------------------
  const pillarById = new Map(props.pillars.map((p) => [p.id, p]))
  const inPlan = new Set(items.map((i) => i.practiceId))
  const available = props.available.filter((p) => !inPlan.has(p.id))

  const addPractice = (p: AvailablePractice) => {
    const item: BuilderItem = {
      practiceId: p.id, title: p.title, description: p.description,
      domainId: p.domainId, note: null, cadence: null, practiceCadence: null,
    }
    setItems((prev) => [...prev, item])
    void persist(() => addPracticeToJourney(props.planId, p.id, p.domainId))
  }

  const removeStep = (practiceId: string) => {
    setItems((prev) => prev.filter((i) => i.practiceId !== practiceId))
    void persist(() => removeJourneyStep(props.planId, practiceId))
  }

  const commitOrder = (next: BuilderItem[]) => {
    setItems(next)
    void persist(() => reorderJourneySteps(props.planId, next.map((i) => i.practiceId)))
  }

  const move = (practiceId: string, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.practiceId === practiceId)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= items.length) return
    const next = [...items]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    commitOrder(next)
  }

  const setStep = (practiceId: string, patch: { note?: string | null; cadence?: string | null }) => {
    setItems((prev) => prev.map((i) => (i.practiceId === practiceId ? { ...i, ...patch } : i)))
    void persist(() => setJourneyStep(props.planId, practiceId, patch))
  }

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const from = items.findIndex((i) => i.practiceId === dragId)
    const to = items.findIndex((i) => i.practiceId === targetId)
    if (from < 0 || to < 0) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDragId(null); setOverId(null)
    commitOrder(next)
  }

  const changeVisibility = async (v: Visibility) => {
    const prev = visibility
    setVisibility(v)
    setSave('saving'); setError(null)
    const res = await setJourneyVisibility(props.planId, v)
    if (isError(res)) {
      setVisibility(prev); setError(res.error); setSave('idle')
    } else {
      flagSaved()
      if (v === 'public') { setCelebrate(true); setTimeout(() => setCelebrate(false), 2600) }
    }
  }

  // --- Derived ------------------------------------------------------------
  const pillarOrder = props.pillars
  const counts = new Map<string, number>()
  for (const it of items) {
    const key = it.domainId ?? '∅'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const filtered = query.trim()
    ? available.filter((p) => (p.title + ' ' + (p.description ?? '')).toLowerCase().includes(query.trim().toLowerCase()))
    : available
  const pickerGroups = [
    ...pillarOrder.map((pl) => ({ name: pl.name, list: filtered.filter((p) => p.domainId === pl.id) })),
    { name: 'Other', list: filtered.filter((p) => !p.domainId) },
  ].filter((g) => g.list.length > 0)

  const PILLAR_ACCENT: Record<string, string> = { mind: 'indigo', body: 'jade', spirit: 'plum', expression: 'gold' }

  // --- Footer -------------------------------------------------------------
  const footer = (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-subtle">
        {save === 'saving' ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
        ) : save === 'saved' ? (
          <><Check className="h-3.5 w-3.5 text-success" /> Saved</>
        ) : (
          <>Autosaves as you go</>
        )}
        {error && <span className="ml-2 text-danger">{error}</span>}
      </span>
      <div className="flex items-center gap-2">
        <a
          href={`/journeys/${props.slug}?preview=1`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
        >
          <Eye className="h-4 w-4" /> Preview
        </a>
        {visibility === 'public' ? (
          <button
            type="button"
            onClick={() => changeVisibility('unlisted')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-success-bg px-4 py-2 text-sm font-semibold text-success transition-colors hover:opacity-90"
          >
            <Check className="h-4 w-4" /> Shared
          </button>
        ) : (
          <button
            type="button"
            onClick={() => changeVisibility('public')}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            title={items.length === 0 ? 'Add a practice first' : undefined}
          >
            {props.isCrew ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Share to community
          </button>
        )}
      </div>
    </div>
  )

  return (
    <StudioWindow open onClose={close} eyebrow="Studio · Journey" footer={footer}>
      {/* Celebration banner on publish */}
      {celebrate && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-success/50 bg-success-bg px-4 py-3 text-sm font-medium text-success motion-safe:animate-in motion-safe:zoom-in-95">
          <PartyPopper className="h-5 w-5 shrink-0" />
          It’s live in the community library — anyone can adopt your journey now.
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Emoji + accent face */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl transition-transform hover:scale-105"
            style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
            aria-label="Choose an emoji"
          >
            {emoji || <Smile className="h-7 w-7" />}
          </button>
          {emojiOpen && (
            <div className="absolute left-0 top-[4.5rem] z-10 w-64 rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setEmoji(e); setEmojiOpen(false); queueMetaSave({ emoji: e }) }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-lg hover:bg-surface-elevated"
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                <input
                  value={emoji}
                  onChange={(e) => { setEmoji(e.target.value.slice(0, 4)); queueMetaSave({ emoji: e.target.value.slice(0, 4) }) }}
                  placeholder="or type one"
                  className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => { setEmoji(''); setEmojiOpen(false); queueMetaSave({ emoji: '' }) }} className="text-xs text-subtle hover:text-text">Clear</button>
              </div>
            </div>
          )}
          {/* Accent dots */}
          <div className="mt-2 flex justify-center gap-1">
            {STUDIO_ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-label={a.label}
                onClick={() => { setAccent(a.key); queueMetaSave({ accent: a.key }) }}
                className={`h-3 w-3 rounded-full ring-offset-1 ring-offset-canvas transition-transform hover:scale-125 ${accent === a.key ? 'ring-2' : ''}`}
                style={{ backgroundColor: accentColor(a.key), ['--tw-ring-color' as string]: accentColor(a.key) }}
              />
            ))}
          </div>
        </div>

        {/* Title + summary */}
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueMetaSave({ title: e.target.value }) }}
            maxLength={120}
            placeholder="Name your journey"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={summary}
            onChange={(e) => { setSummary(e.target.value); queueMetaSave({ summary: e.target.value }) }}
            maxLength={280}
            placeholder="One line on what this is and who it’s for"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      {/* Why / intro — the depth that turns a combo into a course */}
      <div className="mt-4">
        {showIntro || intro ? (
          <textarea
            value={intro}
            onChange={(e) => { setIntro(e.target.value); queueMetaSave({ intro: e.target.value }) }}
            rows={4}
            maxLength={8000}
            placeholder="The why, the how, what you'll get from it. Write as much or as little as you like — a line for a simple practice, a full curriculum for a course."
            className="w-full resize-y rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm leading-relaxed text-text outline-none focus:border-primary"
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
      </div>

      {/* ── Pillar balance ──────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {pillarOrder.map((pl) => {
            const n = counts.get(pl.id) ?? 0
            const c = accentColor(PILLAR_ACCENT[pl.slug] ?? 'jade')
            return (
              <span
                key={pl.slug}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={n > 0
                  ? { backgroundColor: accentTint(PILLAR_ACCENT[pl.slug] ?? 'jade', 16), color: c }
                  : { backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-subtle)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: n > 0 ? c : 'var(--color-subtle)' }} />
                {pl.name} {n > 0 ? n : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* ── The path ─────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">
            The path · {items.length} {items.length === 1 ? 'step' : 'steps'}
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-5 py-8 text-center">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-subtle" />
            <p className="text-sm font-medium text-text">Build your path</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Add the practices that make up this journey — drag to order them into the flow you want.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => {
              const pillar = it.domainId ? pillarById.get(it.domainId) : null
              const cadence = it.cadence ?? it.practiceCadence
              const isOver = overId === it.practiceId && dragId !== it.practiceId
              return (
                <li
                  key={it.practiceId}
                  draggable={expanded !== it.practiceId}
                  onDragStart={() => setDragId(it.practiceId)}
                  onDragOver={(e) => { e.preventDefault(); setOverId(it.practiceId) }}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  onDrop={() => onDrop(it.practiceId)}
                  className={`group rounded-2xl border bg-surface px-3 py-2.5 shadow-sm transition-all ${
                    dragId === it.practiceId ? 'opacity-40' : ''
                  } ${isOver ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle opacity-40 transition-opacity group-hover:opacity-100" />
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-bold tabular-nums text-subtle">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => (v === it.practiceId ? null : it.practiceId))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-text">{it.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {pillar && (
                          <span className="inline-flex items-center gap-1" style={{ color: accentColor(PILLAR_ACCENT[pillar.slug] ?? 'jade') }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor(PILLAR_ACCENT[pillar.slug] ?? 'jade') }} />
                            {pillar.name}
                          </span>
                        )}
                        {cadence && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{cadence}</span>}
                        {it.note && <span className="truncate text-subtle">· {it.note}</span>}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <button type="button" onClick={() => move(it.practiceId, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30 sm:hidden"><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(it.practiceId, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30 sm:hidden"><ChevronDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => removeStep(it.practiceId)} aria-label="Remove step" className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-danger"><X className="h-4 w-4" /></button>
                    </div>
                  </div>

                  {/* Per-step controls */}
                  {expanded === it.practiceId && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2.5">
                      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        Cadence
                        <select
                          value={it.cadence ?? ''}
                          onChange={(e) => setStep(it.practiceId, { cadence: e.target.value || null })}
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
                        >
                          <option value="">Default{it.practiceCadence ? ` (${it.practiceCadence})` : ''}</option>
                          {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        Note for this step
                        <input
                          defaultValue={it.note ?? ''}
                          maxLength={200}
                          onBlur={(e) => { if ((e.target.value || '') !== (it.note ?? '')) setStep(it.practiceId, { note: e.target.value || null }) }}
                          placeholder="e.g. first thing, before coffee"
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
                        />
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {/* Add practices */}
        <div className="mt-3">
          {!pickerOpen ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-primary-strong transition-colors hover:border-primary hover:bg-primary-bg/40"
            >
              <Plus className="h-4 w-4" /> Add a practice
            </button>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-subtle" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search practices…"
                  className="w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
                />
                <button type="button" onClick={() => { setPickerOpen(false); setQuery('') }} aria-label="Close picker" className="rounded-lg p-1 text-subtle hover:bg-surface-elevated hover:text-text"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {pickerGroups.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-muted">{available.length === 0 ? 'Every library practice is already on your path.' : 'No practices match that search.'}</p>
                ) : pickerGroups.map((g) => (
                  <div key={g.name}>
                    <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{g.name}</p>
                    <ul className="space-y-1">
                      {g.list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => addPractice(p)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-primary-bg/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-text">{p.title}</span>
                              {p.description && <span className="block truncate text-xs text-muted">{p.description}</span>}
                            </span>
                            <Plus className="h-4 w-4 shrink-0 text-primary-strong" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Visibility line */}
      <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide text-subtle">Who can see it</span>
        {([
          ['private', Lock, 'Just me'],
          ['unlisted', Link2, 'Anyone with the link'],
        ] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => changeVisibility(v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              visibility === v ? 'bg-primary-bg text-primary-strong' : 'hover:bg-surface-elevated'
            }`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        {visibility === 'public' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-success"><Globe className="h-3 w-3" /> In the community library</span>
        )}
      </div>
    </StudioWindow>
  )
}
