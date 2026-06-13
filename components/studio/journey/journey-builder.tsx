'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, GripVertical, ChevronUp, ChevronDown, Clock, Search, Sparkles,
  Globe, Lock, Link2, Check, PencilLine, PartyPopper, Eye,
} from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { useStudioDraft } from '../kit/use-studio-draft'
import { useSortable } from '../kit/use-sortable'
import { IconAccentFace, AccentPicker, IconGrid } from '../kit/studio-identity'
import { StudioField, StudioSectionLabel } from '../kit/studio-field'
import { SaveStatus, StudioFooter } from '../kit/studio-footer'
import { accentColor, accentTint, DEFAULT_ACCENT } from '@/lib/studio/accents'
import {
  saveJourneyMeta, addPracticeToJourney, removeJourneyStep, reorderJourneySteps,
  setJourneyStep, setJourneyVisibility, setJourneyStepTier, setJourneyCompletionRules,
  setJourneyRewards, setJourneyPageConfig, setJourneyOfficial, loadJourneyOfficialContext,
  addJourneyLesson, updateJourneyLesson, removeJourneyLesson,
} from '@/app/(main)/journeys/actions'
import { isError } from '@/lib/action-result'
import { LessonsSection, type BuilderBlock } from './lessons-section'
import type { IntensityTier } from '@/lib/journey-tiers'
import type { PlanStatus, PageWidgetConfig } from '@/lib/journey-plans'
import { editorPageConfig } from '@/lib/journey-page-config'
import { previewCourse } from '@/lib/journey-course'
import { CoursePlayer } from '@/components/journey/course/course-player'
import {
  TierPicker, CompletionRulesSection, RewardsSection, PageLayoutSection,
  OfficialSection, StatusChip,
} from './journey-sections'

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']
// Pillar → accent token, for the balance meter + per-step dot.
const PILLAR_ACCENT: Record<string, string> = { mind: 'indigo', body: 'jade', spirit: 'plum', expression: 'gold' }

export type Visibility = 'private' | 'unlisted' | 'public'

export interface BuilderItem {
  practiceId: string
  title: string
  description: string | null
  domainId: string | null
  note: string | null
  cadence: string | null
  practiceCadence: string | null
  /** The author's default intensity tier for this step (ADR-198). Optional for
   *  backward-compat; defaults to 'adept'. */
  defaultTier?: IntensityTier
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
  /** Lesson/section blocks (ADR-244). Optional; defaults to none. */
  initialBlocks?: BuilderBlock[]
  available: AvailablePractice[]
  pillars: PillarLite[]
  // ── New editor sections (docs/JOURNEYS.md §11). All optional + defaulted so the
  //    existing page invocation keeps working; the page can pass them once ready. ──
  /** Review state of the plan (drives the publish workflow + status chip). */
  initialStatus?: PlanStatus
  /** Completion-rule fields. */
  initialMinPracticesPerDay?: number
  initialTargetWeeks?: number
  initialSeasonLocked?: boolean
  /** Reward field. */
  initialCompletionGems?: number
  /** Page-layout widget config (null → the hardcoded default). */
  initialPageConfig?: PageWidgetConfig[] | null
  /** Official-program state (only meaningful for Guide/Mentor authors). */
  initialOfficial?: boolean
  initialQuestId?: string | null
  /** If the page already resolved the caller's role + quests, pass them to render
   *  the Official section synchronously; otherwise the builder lazy-loads them. */
  canMakeOfficial?: boolean
  quests?: { id: string; name: string; emoji: string | null }[]
}

export function JourneyBuilder(props: Props) {
  const router = useRouter()
  const close = useCallback(() => router.push('/journeys'), [router])

  // Studio autosave engine (kit) — stable save/onError so its callbacks stay stable.
  const save = useCallback(
    (patch: Parameters<typeof saveJourneyMeta>[1]) => saveJourneyMeta(props.planId, patch),
    [props.planId],
  )
  const onError = useCallback(() => router.refresh(), [router])
  const { saveState, error, run, queueSave } = useStudioDraft({ save, onError })

  // Identity — `icon` is a journey-icon key, stored in the plan's `emoji` column.
  const [icon, setIcon] = useState(props.initialEmoji ?? 'compass')
  const [accent, setAccent] = useState(props.initialAccent ?? DEFAULT_ACCENT)
  const [title, setTitle] = useState(props.initialTitle)
  const [summary, setSummary] = useState(props.initialSummary ?? '')
  const [intro, setIntro] = useState(props.initialIntro ?? '')
  const [showIntro, setShowIntro] = useState(!!props.initialIntro)
  const [iconOpen, setIconOpen] = useState(false)

  // Path
  const [items, setItems] = useState<BuilderItem[]>(props.initialItems)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(props.initialItems.length === 0)
  const [query, setQuery] = useState('')

  // Visibility + publishing status + celebration
  const [visibility, setVisibility] = useState<Visibility>(props.initialVisibility)
  const [status, setStatus] = useState<PlanStatus>(props.initialStatus ?? 'draft')
  const [celebrate, setCelebrate] = useState<null | 'live' | 'review'>(null)

  // Completion rules
  const [minPerDay, setMinPerDay] = useState(props.initialMinPracticesPerDay ?? 1)
  const [targetWeeks, setTargetWeeks] = useState(props.initialTargetWeeks ?? 8)
  const [seasonLocked, setSeasonLocked] = useState(props.initialSeasonLocked ?? false)

  // Rewards
  const [completionGems, setCompletionGems] = useState(props.initialCompletionGems ?? 30)

  // Page layout (always a full, normalized catalog so the editor is stable)
  const [pageConfig, setPageConfig] = useState<PageWidgetConfig[]>(
    () => editorPageConfig(props.initialPageConfig ?? null),
  )

  // Official program (Guide/Mentor only). Role + assignable quests come from the
  // page when available, else lazy-loaded on mount (the page hasn't been updated
  // to pass them yet — keeps the section working end-to-end regardless).
  const [official, setOfficial] = useState(props.initialOfficial ?? false)
  const [questId, setQuestId] = useState<string | null>(props.initialQuestId ?? null)
  const [canMakeOfficial, setCanMakeOfficial] = useState(props.canMakeOfficial ?? false)
  const [quests, setQuests] = useState(props.quests ?? [])

  useEffect(() => {
    if (props.canMakeOfficial !== undefined) return // page already resolved it
    let live = true
    void loadJourneyOfficialContext(props.planId).then((res) => {
      if (!live || 'error' in res) return
      setCanMakeOfficial(res.data.canMakeOfficial)
      setQuests(res.data.quests)
    })
    return () => { live = false }
  }, [props.planId, props.canMakeOfficial])

  // --- Item operations (optimistic; run() resyncs on failure) --------------
  const pillarById = new Map(props.pillars.map((p) => [p.id, p]))
  const inPlan = new Set(items.map((i) => i.practiceId))
  const available = props.available.filter((p) => !inPlan.has(p.id))

  const addPractice = (p: AvailablePractice) => {
    setItems((prev) => [...prev, {
      practiceId: p.id, title: p.title, description: p.description,
      domainId: p.domainId, note: null, cadence: null, practiceCadence: null,
    }])
    void run(() => addPracticeToJourney(props.planId, p.id, p.domainId))
  }
  const removeStep = (practiceId: string) => {
    setItems((prev) => prev.filter((i) => i.practiceId !== practiceId))
    void run(() => removeJourneyStep(props.planId, practiceId))
  }
  const commitOrder = (next: BuilderItem[]) => {
    setItems(next)
    void run(() => reorderJourneySteps(props.planId, next.map((i) => i.practiceId)))
  }
  const setStep = (practiceId: string, patch: { note?: string | null; cadence?: string | null }) => {
    setItems((prev) => prev.map((i) => (i.practiceId === practiceId ? { ...i, ...patch } : i)))
    void run(() => setJourneyStep(props.planId, practiceId, patch))
  }
  const setStepTier = (practiceId: string, tier: IntensityTier) => {
    setItems((prev) => prev.map((i) => (i.practiceId === practiceId ? { ...i, defaultTier: tier } : i)))
    void run(() => setJourneyStepTier(props.planId, practiceId, tier))
  }

  const { itemProps, move, isDragging, isOver } = useSortable(items, (i) => i.practiceId, commitOrder)

  // --- Lesson/section blocks (ADR-244) — id-keyed, optimistic ----------------
  const [blocks, setBlocks] = useState<BuilderBlock[]>(props.initialBlocks ?? [])
  const [addingBlock, setAddingBlock] = useState(false)
  const addBlock = async (kind: 'lesson' | 'section') => {
    setAddingBlock(true)
    const res = await addJourneyLesson(props.planId, { kind })
    setAddingBlock(false)
    if (isError(res)) { router.refresh(); return }
    setBlocks((b) => [...b, { id: res.data.id, blockType: kind, title: '', body: '' }])
  }
  const changeBlock = (id: string, patch: Partial<BuilderBlock>) =>
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const saveBlock = (id: string) => {
    const blk = blocks.find((x) => x.id === id)
    if (!blk) return
    void run(() => updateJourneyLesson(props.planId, id, { title: blk.title, body: blk.body }))
  }
  const deleteBlock = (id: string) => {
    setBlocks((b) => b.filter((x) => x.id !== id))
    void run(() => removeJourneyLesson(props.planId, id))
  }

  const changeVisibility = async (v: Visibility) => {
    const prev = visibility
    setVisibility(v)
    const res = await run(() => setJourneyVisibility(props.planId, v))
    if (!res) { setVisibility(prev); return }
    // setJourneyVisibility returns the resolved review state; reflect it + celebrate.
    if (v === 'public') {
      // Mentor+ auto-approves → "live"; member-built public → "in review".
      const reviewed = canMakeOfficial
      const next: PlanStatus = reviewed ? 'approved' : 'pending'
      setStatus(next)
      setCelebrate(reviewed ? 'live' : 'review')
      setTimeout(() => setCelebrate(null), 3200)
    } else {
      setStatus('draft')
    }
  }

  // --- New section handlers (each autosaves via run/queue) ------------------
  const saveCompletion = (patch: { minPracticesPerDay?: number; targetWeeks?: number; seasonLocked?: boolean }) => {
    if (patch.minPracticesPerDay !== undefined) setMinPerDay(patch.minPracticesPerDay)
    if (patch.targetWeeks !== undefined) setTargetWeeks(patch.targetWeeks)
    if (patch.seasonLocked !== undefined) setSeasonLocked(patch.seasonLocked)
    void run(() => setJourneyCompletionRules(props.planId, patch))
  }
  const saveGems = (gems: number) => {
    setCompletionGems(gems)
    void run(() => setJourneyRewards(props.planId, gems))
  }
  const savePageConfig = (next: PageWidgetConfig[]) => {
    setPageConfig(next)
    void run(() => setJourneyPageConfig(props.planId, next))
  }
  const saveOfficial = (opts: { official: boolean; questId?: string | null }) => {
    setOfficial(opts.official)
    if (opts.questId !== undefined) setQuestId(opts.questId)
    void run(() => setJourneyOfficial(props.planId, opts))
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

  const footer = (
    <StudioFooter left={<SaveStatus state={saveState} error={error} />}>
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
          <Globe className="h-4 w-4" /> Share to community
        </button>
      )}
    </StudioFooter>
  )

  return (
    <StudioWindow open onClose={close} eyebrow="Studio · Journey" footer={footer}>
      {celebrate === 'live' && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-success/50 bg-success-bg px-4 py-3 text-sm font-medium text-success motion-safe:animate-in motion-safe:zoom-in-95">
          <PartyPopper className="h-5 w-5 shrink-0" />
          It’s live in the community library. Anyone can adopt your Journey now.
        </div>
      )}
      {celebrate === 'review' && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-warning/50 bg-warning-bg px-4 py-3 text-sm font-medium text-warning motion-safe:animate-in motion-safe:zoom-in-95">
          <PartyPopper className="h-5 w-5 shrink-0" />
          Submitted. A Guide will review it shortly, then it goes live in the library.
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <IconAccentFace icon={icon} accent={accent} size="lg" onClick={() => setIconOpen((v) => !v)} />
          {iconOpen && (
            <div className="absolute left-0 top-[4.5rem] z-10 w-64 rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <IconGrid value={icon} size="sm" onPick={(k) => { setIcon(k); setIconOpen(false); queueSave({ emoji: k }) }} />
            </div>
          )}
          <div className="mt-2 flex justify-center">
            <AccentPicker accent={accent} onChange={(a) => { setAccent(a); queueSave({ accent: a }) }} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueSave({ title: e.target.value }) }}
            maxLength={120}
            placeholder="Name your Journey"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={summary}
            onChange={(e) => { setSummary(e.target.value); queueSave({ summary: e.target.value }) }}
            maxLength={280}
            placeholder="One line on what this is and who it’s for"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      {/* Why / intro */}
      <div className="mt-4">
        {showIntro || intro ? (
          <textarea
            value={intro}
            onChange={(e) => { setIntro(e.target.value); queueSave({ intro: e.target.value }) }}
            rows={4}
            maxLength={8000}
            placeholder="The why, the how, what you'll get from it. Write as much or as little as you like. A line for a simple practice, a full curriculum for a course."
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

      {/* ── Live preview — the e-learning course player, rendered from the current
            draft (docs/JOURNEYS.md §5A). Non-interactive (no logging); it's how the
            adopted page will read. Collapsed by default so it never crowds the tools. ── */}
      {(items.length > 0 || blocks.length > 0) && (
        <details className="group mt-6 rounded-2xl border border-border bg-surface/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-text">
              <Eye className="h-4 w-4 text-primary-strong" /> Live preview
              <span className="font-normal text-subtle">· how learners see it</span>
            </span>
            <ChevronDown className="h-4 w-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border p-4">
            <CoursePlayer
              course={previewCourse([
                ...items.map((it) => ({
                  id: it.practiceId,
                  title: it.title,
                  body: it.description,
                  cadenceLabel: it.cadence ?? it.practiceCadence,
                })),
                ...blocks
                  .filter((b) => b.blockType === 'lesson')
                  .map((b) => ({ id: b.id, title: b.title, body: b.body || null, cadenceLabel: null })),
              ])}
              planTitle={title || 'Your Journey'}
              accent={accent}
            />
          </div>
        </details>
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
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Add the practices that make up this Journey, then drag to order them into the flow you want.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => {
              const pillar = it.domainId ? pillarById.get(it.domainId) : null
              const cadence = it.cadence ?? it.practiceCadence
              return (
                <li
                  key={it.practiceId}
                  {...itemProps(it.practiceId)}
                  draggable={expanded !== it.practiceId}
                  className={`group rounded-2xl border bg-surface px-3 py-2.5 shadow-sm transition-all ${
                    isDragging(it.practiceId) ? 'opacity-40' : ''
                  } ${isOver(it.practiceId) ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
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
                      <TierPicker
                        value={it.defaultTier ?? 'adept'}
                        onChange={(t) => setStepTier(it.practiceId, t)}
                      />
                      <StudioField label="Cadence">
                        <select
                          value={it.cadence ?? ''}
                          onChange={(e) => setStep(it.practiceId, { cadence: e.target.value || null })}
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
                        >
                          <option value="">Default{it.practiceCadence ? ` (${it.practiceCadence})` : ''}</option>
                          {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </StudioField>
                      <StudioField label="Note for this step" className="min-w-[12rem] flex-1">
                        <input
                          defaultValue={it.note ?? ''}
                          maxLength={200}
                          onBlur={(e) => { if ((e.target.value || '') !== (it.note ?? '')) setStep(it.practiceId, { note: e.target.value || null }) }}
                          placeholder="e.g. first thing, before coffee"
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
                        />
                      </StudioField>
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
                    <StudioSectionLabel className="mb-1 px-1">{g.name}</StudioSectionLabel>
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

      {/* ── Lessons (the e-learning blocks, ADR-244) ─────────────── */}
      <LessonsSection
        blocks={blocks}
        busy={addingBlock}
        onAdd={addBlock}
        onChange={changeBlock}
        onSave={saveBlock}
        onDelete={deleteBlock}
      />

      {/* ── Completion rules ─────────────────────────────────────── */}
      <CompletionRulesSection
        minPracticesPerDay={minPerDay}
        targetWeeks={targetWeeks}
        seasonLocked={seasonLocked}
        onChange={saveCompletion}
      />

      {/* ── Rewards ──────────────────────────────────────────────── */}
      <RewardsSection
        completionGems={completionGems}
        onChange={saveGems}
        canOverrideZap={canMakeOfficial}
      />

      {/* ── Page layout ──────────────────────────────────────────── */}
      <PageLayoutSection config={pageConfig} onChange={savePageConfig} />

      {/* ── Official program (Guide/Mentor only) ─────────────────── */}
      {canMakeOfficial && (
        <OfficialSection
          official={official}
          questId={questId}
          quests={quests}
          onChange={saveOfficial}
        />
      )}

      {/* Visibility line */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted">
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
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-success"><Globe className="h-3 w-3" /> In the community library</span>
            {status !== 'approved' && <StatusChip status={status} />}
          </>
        )}
      </div>
    </StudioWindow>
  )
}
