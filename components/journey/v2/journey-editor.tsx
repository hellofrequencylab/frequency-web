'use client'

// Journeys v2 — the structure editor (ADR-252, J4b). A clean, structure-first builder: phases
// with bite-sized lessons (and optional library practices), edit title/type/content inline,
// reorder, delete, and live-preview in the player. Renders loose top-level steps too (existing
// pre-v2 journeys have steps with no phase) so nothing is ever hidden — matching the player,
// which wraps loose steps in an implicit phase. Calls the author-gated edit actions.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Layers, Search, Dumbbell, X, Check, Sparkles, Award, Zap, ExternalLink, RefreshCw, Anchor } from 'lucide-react'
import {
  addPhaseAction,
  addModuleAction,
  addLessonAction,
  addPracticeBlockAction,
  addExtraCreditAction,
  updateBlockAction,
  removeBlockAction,
  moveBlockAction,
  draftSlotCoachingAction,
  populateWeekAction,
  setBlockPracticeAction,
  setLeafAnchorAction,
  setLeafWarmupMessageAction,
} from '@/app/(main)/journeys/[slug]/edit/actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { WARMUP_MESSAGE_MAX } from '@/lib/on-air'
import type { CheckConfig } from '@/lib/journeys/store'
import { PillarChip } from './pillar-chip'

export interface EditorBlock {
  id: string
  parentId: string | null
  blockType: string
  title: string
  body: string
  sortOrder: number
  /** Knowledge-check config for `check` blocks (build item §11.1 #2), else null. */
  check: CheckConfig | null
  /** The slot's Pillar (practice blocks) — drives the pillar chip + Vera grounding. */
  domainId: string | null
  /** The library practice this slot adopts (practice_id), or null. When set, the slot reads as
   *  adopted: pillar badge + a link out to the library practice + a Replace control to swap it. */
  practiceId: string | null
  /** Vera's per-slot coaching line (practice blocks), from settings.coaching_prompt. */
  coachingPrompt: string | null
  /** Extra-credit block (ADR-300 Part 2): a bonus task that pays Zaps, not a Pillar practice. */
  extraCredit: boolean
  /** Bonus Zaps paid on completing an extra-credit block. */
  bonusZaps: number
  /** Anchor (Master Template): this practice is the daily through-line. Read from settings.anchor.
   *  Optional + read defensively so a loaded block that doesn't surface it yet just reads false. */
  anchor?: boolean
  /** The raw block settings, when the loader passes them through. Lets the Anchor flag be read
   *  defensively via `settings.anchor` (and the P5 warm-up override via `settings.warmup_message`)
   *  even when they aren't mapped explicitly. */
  settings?: { anchor?: boolean; warmup_message?: string } | null
}

/** Whether a block is the daily Anchor (Master Template). Reads the mapped `anchor` first, then
 *  falls back to the raw `settings.anchor` (the contract's defensive read), so it works whichever
 *  way the loader exposes it. */
const isAnchor = (b: EditorBlock): boolean =>
  b.anchor === true || (b.settings as { anchor?: boolean } | null)?.anchor === true

// The authoring inspector for a `check` block: question + options (tap the circle to mark the
// correct one) + explanation. Members get instant feedback + retries in the player. Local state;
// onSave persists the whole config (settings.check) via updateBlockAction.
function CheckEditor({ initial, disabled, onSave }: { initial: CheckConfig | null; disabled: boolean; onSave: (c: CheckConfig) => void }) {
  const [cfg, setCfg] = useState<CheckConfig>(() => initial ?? { question: '', options: ['', ''], answer: 0, explanation: '' })
  const commit = (next: CheckConfig) => { setCfg(next); onSave(next) }
  const inputCls = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none'
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Knowledge check</p>
      <input value={cfg.question} disabled={disabled} onChange={(e) => setCfg({ ...cfg, question: e.target.value })} onBlur={() => onSave(cfg)} placeholder="Question" className={inputCls} />
      <div className="space-y-1.5">
        {cfg.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => commit({ ...cfg, answer: i })}
              aria-label="Mark as the correct answer"
              title="Correct answer"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-bold ${cfg.answer === i ? 'border-success text-success' : 'border-border text-subtle hover:border-text'}`}
            >
              {cfg.answer === i ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + i)}
            </button>
            <input value={opt} disabled={disabled} onChange={(e) => { const o = [...cfg.options]; o[i] = e.target.value; setCfg({ ...cfg, options: o }) }} onBlur={() => onSave(cfg)} placeholder={`Option ${i + 1}`} className={inputCls} />
            {cfg.options.length > 2 && (
              <button type="button" disabled={disabled} onClick={() => { const o = cfg.options.filter((_, j) => j !== i); commit({ ...cfg, options: o, answer: Math.min(cfg.answer, o.length - 1) }) }} aria-label="Remove option" className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-subtle hover:text-danger">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {cfg.options.length < 6 && (
        <button type="button" disabled={disabled} onClick={() => commit({ ...cfg, options: [...cfg.options, ''] })} className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      )}
      <input value={cfg.explanation ?? ''} disabled={disabled} onChange={(e) => setCfg({ ...cfg, explanation: e.target.value })} onBlur={() => onSave(cfg)} placeholder="Why (shown after they answer)" className={inputCls} />
      <p className="text-2xs text-subtle">Tap the circle to mark the correct option. Members get instant feedback and can retry.</p>
    </div>
  )
}

export interface EditorPractice {
  id: string
  title: string
  description: string | null
  /** The practice's primary Pillar (practices.domain_id) — for the pillar-faceted picker. */
  pillarId: string | null
}

/** The four Pillars (Mind/Body/Spirit/Expression), for the practice selector's facets. */
export interface EditorPillar {
  id: string
  name: string
  slug: string
}

const LEAF_TYPES = ['lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource'] as const
const LOOSE_KEY = '__loose__'

// One coaching slot for a practice block — Vera drafts a short line (grounded in the season,
// the Journey name, the practice, and its Pillar), and the author can edit it. Generated on
// demand to keep cost down; the action returns the text so the field updates without a refresh.
function SlotCoaching({
  slug,
  itemId,
  initialPrompt,
  initialWarmup,
  pillarName,
  disabled,
}: {
  slug: string
  itemId: string
  initialPrompt: string | null
  initialWarmup: string | null
  pillarName: string | null
  disabled: boolean
}) {
  const [value, setValue] = useState(initialPrompt ?? '')
  const [warmup, setWarmup] = useState(initialWarmup ?? '')
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const draft = () => {
    setError(null)
    startBusy(async () => {
      const res = await draftSlotCoachingAction(slug, itemId)
      if (isError(res)) setError(res.error ?? 'Vera could not draft a prompt.')
      else setValue(res.data.prompt)
    })
  }
  return (
    <div className="mt-2 rounded-lg border border-dashed border-primary/30 bg-primary-bg/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary-strong" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Vera coaching prompt</span>
          {pillarName && (
            <span className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-2xs font-medium text-muted">{pillarName}</span>
          )}
        </div>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={draft}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary-strong hover:bg-primary-bg disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" /> {busy ? 'Drafting…' : value ? 'Redraft' : 'Draft with Vera'}
        </button>
      </div>
      <textarea
        value={value}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => updateBlockAction(slug, itemId, { coachingPrompt: value })}
        rows={2}
        placeholder="What Vera nudges them with when they reach this practice. Draft it with Vera or write your own."
        className="mt-1.5 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
      />
      {/* Per-step warm-up override (ADR-592, P5): shown in the timer pre-roll for this step, over
          the practice's own warm-up message. Blank = the practice's message (or a silent pre-roll). */}
      <label className="mt-2 block text-2xs font-semibold uppercase tracking-wide text-subtle">Warm-up message for this step</label>
      <textarea
        value={warmup}
        disabled={disabled}
        onChange={(e) => setWarmup(e.target.value)}
        onBlur={() => setLeafWarmupMessageAction(slug, itemId, warmup)}
        rows={2}
        maxLength={WARMUP_MESSAGE_MAX}
        placeholder="Shown as the timer counts in, just for this Journey step. Leave blank to use the practice's own."
        className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
      />
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  )
}

export function JourneyEditor({
  slug,
  planId = null,
  blocks,
  practices = [],
  pillars = [],
}: {
  slug: string
  /** The plan id — required for the Anchor toggle (setLeafAnchorAction takes a planId). The page
   *  passes it through; when absent the Anchor control just shows as read-only. */
  planId?: string | null
  blocks: EditorBlock[]
  practices?: EditorPractice[]
  pillars?: EditorPillar[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picker, setPicker] = useState<string | null>(null) // phase id, or LOOSE_KEY
  // The practice block whose slot is being swapped (the "Replace" flow, J4b §9). Independent of
  // `picker` (the add-a-new-block flow) — both share the same pillar-faceted picker UI below.
  const [replacing, setReplacing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Pillar facets for the practice selector: which Pillars are toggled on. Empty = all Pillars.
  // Unselected Pillars stay on screen (greyed), so the author sees the full set to choose from.
  const [pillarFilter, setPillarFilter] = useState<Set<string>>(new Set())
  const pillarNameById = new Map(pillars.map((p) => [p.id, p.name]))
  const pillarSlugById = new Map(pillars.map((p) => [p.id, p.slug]))
  const togglePillar = (id: string) =>
    setPillarFilter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  // Tighter, phased builder: every step collapses to a one-line row (title + chip) and expands to
  // edit (body + coaching), and each phase folds away with a step count — so a full Journey reads as
  // a short outline, not an endless scroll of open textareas. A freshly added blank step auto-opens.
  const [openLeaves, setOpenLeaves] = useState<Set<string>>(new Set())
  // Empty phases (e.g. the wizard's not-yet-filled later weeks) start COLLAPSED; phases that already
  // have content (Week 1) start open — so after onboarding the editor reads as a tidy outline.
  const [closedPhases, setClosedPhases] = useState<Set<string>>(() => {
    const hasChild = new Set(blocks.filter((b) => b.parentId).map((b) => b.parentId as string))
    const closed = new Set<string>()
    for (const b of blocks) {
      if (b.blockType === 'phase' && b.parentId === null && !hasChild.has(b.id)) closed.add(b.id)
    }
    return closed
  })
  const toggleLeaf = (id: string) =>
    setOpenLeaves((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const togglePhase = (id: string) =>
    setClosedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const addAndOpen = (fn: () => Promise<ActionResult<{ id: string }>>) =>
    start(async () => {
      const res = await fn()
      if (!isError(res)) setOpenLeaves((prev) => new Set(prev).add(res.data.id))
      router.refresh()
    })

  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder)
  // The current Anchor practice, if any — used to note "an anchor already exists" when turning a new
  // one on. Only one Anchor is expected; uniqueness isn't enforced in the UI (the orchestrator can).
  const anchorBlock = blocks.find((b) => b.blockType === 'practice' && isAnchor(b)) ?? null
  const toggleAnchor = (itemId: string, next: boolean) => {
    if (!planId) return
    run(() => setLeafAnchorAction(planId, itemId, next))
  }
  const isLeaf = (b: EditorBlock) => b.blockType !== 'phase' && b.blockType !== 'module'
  const phases = sorted.filter((b) => b.blockType === 'phase' && b.parentId === null)
  const lessonsOf = (phaseId: string) => sorted.filter((b) => b.parentId === phaseId && isLeaf(b))
  const modulesOf = (phaseId: string) => sorted.filter((b) => b.parentId === phaseId && b.blockType === 'module')

  // A Module groups lessons into a session within a Phase (build item §11.1 #3). Own title +
  // its leaves + the same add-step tools. The player/tree already render Phase → Module → Lesson.
  const ModuleGroup = (m: EditorBlock) => (
    <div key={m.id} className="rounded-xl border border-border bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-subtle">Module</span>
        <input
          defaultValue={m.title}
          onBlur={(e) => run(() => updateBlockAction(slug, m.id, { title: e.target.value }))}
          placeholder="Module title"
          className="min-w-[8rem] flex-1 rounded-md border border-border bg-canvas px-1.5 py-1.5 text-sm font-semibold text-text hover:border-border focus:border-primary focus:outline-none"
        />
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, m.id, 'up'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, m.id, 'down'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, m.id))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-danger" aria-label="Delete module"><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      {renderLeaves(m.id)}
      {stepTools(m.id, m.id)}
    </div>
  )
  // Pre-v2 journeys keep their steps at the top level (no phase parent). Show them so the
  // author can edit them and organize them into phases.
  const looseLeaves = sorted.filter((b) => b.parentId === null && isLeaf(b))

  const used = new Set(blocks.filter((b) => b.blockType === 'practice').map((b) => b.title))
  const term = query.trim().toLowerCase()
  const pickList = practices
    .filter((p) => !used.has(p.title))
    // Pillar facet: when any Pillar is toggled on, show only practices in those Pillars
    // (preloaded from the chosen Pillar/Focus). Empty filter = the whole library.
    .filter((p) => pillarFilter.size === 0 || (p.pillarId !== null && pillarFilter.has(p.pillarId)))
    .filter((p) => !term || (p.title + ' ' + (p.description ?? '')).toLowerCase().includes(term))
    .slice(0, 30)

  const addPractice = (parentId: string | null, practiceId: string) => {
    setPicker(null)
    setQuery('')
    run(() => addPracticeBlockAction(slug, parentId, practiceId))
  }

  // Replace flow (J4b §9): re-link an existing practice slot to a different library practice.
  const swapPractice = (itemId: string, practiceId: string) => {
    setReplacing(null)
    setQuery('')
    run(() => setBlockPracticeAction(slug, itemId, practiceId))
  }

  // ── The pillar-faceted practice picker panel, shared by the Add-a-practice flow (stepTools) and
  //    the per-slot Replace flow (a practice row). A render function (not a component) so the search
  //    box + Pillar facets keep their state across renders. `onPick` is what to do with the chosen
  //    practice (add a block, or swap this slot's practice); `onClose` dismisses the panel. ──
  const practicePicker = (onPick: (practiceId: string) => void, onClose: () => void) => (
    <div className="mt-2 rounded-xl border border-border bg-canvas p-2">
      {/* Pillar facets — tap a Pillar to preload its practices. Unselected Pillars stay
          on screen, greyed, so the whole set is always one tap away (Mind/Body/Spirit/
          Expression). No selection = the whole library. */}
      {pillars.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {pillars.map((pl) => {
            const on = pillarFilter.has(pl.id)
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => togglePillar(pl.id)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? 'border-primary/40 bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-subtle opacity-60 hover:opacity-100 hover:text-text'
                }`}
              >
                {pl.name}
              </button>
            )
          })}
          {pillarFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setPillarFilter(new Set())}
              className="rounded-full px-2 py-1 text-xs font-medium text-muted hover:text-text"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div className="mb-2 flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search practices…"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
        />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-subtle hover:text-text"><X className="h-4 w-4" /></button>
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto">
        {pickList.length === 0 ? (
          <li className="px-2 py-2 text-sm text-muted">
            No matching practices.{' '}
            <a href="/practices" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-strong hover:underline">
              Create one in the library
            </a>{' '}
            and it will show up here.
          </li>
        ) : (
          pickList.map((pr) => (
            <li key={pr.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(pr.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-primary-bg/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text">{pr.title}</span>
                  {pr.description && <span className="block truncate text-xs text-muted">{pr.description}</span>}
                </span>
                <Plus className="h-4 w-4 shrink-0 text-primary-strong" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )

  // ── A single editable step (lesson or practice) — used in phases and the loose section. ──
  const LeafRow = (l: EditorBlock) => {
    const isExtra = l.extraCredit
    const isPractice = !isExtra && l.blockType === 'practice'
    const open = openLeaves.has(l.id)
    const anchored = isPractice && isAnchor(l)
    return (
      <li key={l.id} className={`rounded-xl border ${open ? 'p-3' : 'px-3 py-2'} ${isExtra ? 'border-signal/30 bg-signal-bg/20' : 'border-border bg-canvas'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleLeaf(l.id)}
            aria-expanded={open}
            aria-label={open ? 'Collapse step' : 'Expand step'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-subtle hover:text-text"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {isExtra ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-signal/30 bg-signal-bg/60 px-1.5 py-1 text-xs font-medium text-signal-strong" title="Extra credit: a bonus task, above and beyond, that pays Zaps">
              <Award className="h-3.5 w-3.5" /> extra credit
            </span>
          ) : isPractice ? (
            // The Pillar this practice covers, as a tinted chip (J4b §12). Falls back to a neutral
            // "Practice" chip when the slot has no Pillar yet.
            <PillarChip
              slug={l.domainId ? pillarSlugById.get(l.domainId) ?? null : null}
              name={l.domainId ? pillarNameById.get(l.domainId) ?? null : null}
            />
          ) : (
            <select
              defaultValue={LEAF_TYPES.includes(l.blockType as (typeof LEAF_TYPES)[number]) ? l.blockType : 'lesson'}
              onChange={(e) => run(() => updateBlockAction(slug, l.id, { blockType: e.target.value }))}
              className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-muted"
            >
              {LEAF_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          {anchored && (
            // The daily through-line, badged like the extra-credit chip so it reads at a glance.
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary-bg px-1.5 py-1 text-xs font-medium text-primary-strong" title="Anchor: the daily through-line of this Journey">
              <Anchor className="h-3.5 w-3.5" /> Anchor
            </span>
          )}
          <input
            defaultValue={l.title}
            onBlur={(e) => run(() => updateBlockAction(slug, l.id, { title: e.target.value }))}
            className="min-w-[8rem] flex-1 rounded-md border border-border bg-canvas px-1.5 py-1.5 text-sm text-text hover:border-border focus:border-primary focus:outline-none"
            placeholder={isExtra ? 'Challenge name' : isPractice ? 'Practice step' : 'Lesson title'}
          />
          {isExtra && (
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Bonus Zaps paid on completion">
              <Zap className="h-3.5 w-3.5 text-signal-strong" aria-hidden />
              <input
                type="number"
                min={0}
                max={500}
                defaultValue={l.bonusZaps}
                onBlur={(e) => run(() => updateBlockAction(slug, l.id, { bonusZaps: Number(e.target.value) }))}
                className="w-14 rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-text focus:border-primary focus:outline-none"
                aria-label="Bonus Zaps"
              />
              Zaps
            </label>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {isPractice && l.practiceId && (
              // An adopted slot links out to its library practice (opens in a new tab) — J4b §5/§8.
              <a
                href={`/practices/${l.practiceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-primary-strong"
                aria-label="Open this practice in the library"
                title="Open in the library"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'up'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'down'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, l.id))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-danger" aria-label="Delete step"><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        </div>
        {open && (
          <>
            <textarea
              defaultValue={l.body}
              onBlur={(e) => run(() => updateBlockAction(slug, l.id, { body: e.target.value }))}
              rows={2}
              placeholder={isExtra ? 'What is the challenge, and what counts as done?' : isPractice ? 'A note for this practice step (optional).' : 'Lesson content (markdown). Paste a YouTube/Vimeo/video link to embed it.'}
              className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
            {!isExtra && l.blockType === 'check' && (
              <CheckEditor
                initial={l.check}
                disabled={pending}
                onSave={(cfg) => run(() => updateBlockAction(slug, l.id, { check: cfg }))}
              />
            )}
            {isPractice && (
              <>
                {/* Adopt / Replace (J4b §8–§10). An adopted slot (practice_id set) reads as adopted
                    and offers Replace; an unlinked slot offers "Add a Practice". Both open the same
                    pillar-faceted picker, scoped to THIS block — choosing one re-links the slot. */}
                <div className="mt-2 flex items-center gap-2">
                  {l.practiceId ? (
                    <span className="inline-flex items-center gap-1 text-2xs font-medium text-success" title="This slot adopts a library practice">
                      <Check className="h-3.5 w-3.5" /> Adopted from the library
                    </span>
                  ) : (
                    <span className="text-2xs text-subtle">No library practice linked yet.</span>
                  )}
                  {practices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setReplacing((v) => (v === l.id ? null : l.id)); setQuery('') }}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary-strong hover:bg-primary-bg"
                    >
                      {l.practiceId ? <><RefreshCw className="h-3.5 w-3.5" /> Replace</> : <><Plus className="h-3.5 w-3.5" /> Add a Practice</>}
                    </button>
                  )}
                </div>
                {replacing === l.id &&
                  practicePicker(
                    (practiceId) => swapPractice(l.id, practiceId),
                    () => { setReplacing(null); setQuery('') },
                  )}
                {/* Anchor (Master Template): mark this practice as the daily through-line. Styled like
                    the Adopt/Replace affordances on this row. Only one is expected; turning a new one
                    on notes that an anchor already exists, but never blocks (the orchestrator can
                    enforce uniqueness later). */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || !planId}
                    onClick={() => toggleAnchor(l.id, !anchored)}
                    aria-pressed={anchored}
                    title="Anchor: the one daily practice that runs through the whole Journey"
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${anchored ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'}`}
                  >
                    <Anchor className="h-3.5 w-3.5" /> {anchored ? 'Anchor (daily through-line)' : 'Make this the Anchor'}
                  </button>
                  {!anchored && anchorBlock && (
                    <span className="text-2xs text-subtle">
                      An anchor is already set on {anchorBlock.title || 'another practice'}.
                    </span>
                  )}
                </div>
                <SlotCoaching
                  slug={slug}
                  itemId={l.id}
                  initialPrompt={l.coachingPrompt}
                  initialWarmup={l.settings?.warmup_message ?? null}
                  pillarName={l.domainId ? pillarNameById.get(l.domainId) ?? null : null}
                  disabled={pending}
                />
              </>
            )}
          </>
        )}
      </li>
    )
  }

  // ── A parent's leaves (lessons, extra credit, and practices), with the practice blocks gathered
  //    under a small "Practices" heading (J4b §11). Lessons and extra-credit stay where they are, in
  //    sort order; the practice group comes after, so a phase reads as "the lessons, then the four
  //    Pillar practices". Returns null when the parent has no leaves at all. ──
  const renderLeaves = (parentId: string) => {
    const leaves = lessonsOf(parentId)
    if (leaves.length === 0) return null
    const isPracticeLeaf = (l: EditorBlock) => l.blockType === 'practice' && !l.extraCredit
    const practiceLeaves = leaves.filter(isPracticeLeaf)
    const otherLeaves = leaves.filter((l) => !isPracticeLeaf(l))
    return (
      <>
        {otherLeaves.length > 0 && <ul className="mt-3 space-y-2">{otherLeaves.map(LeafRow)}</ul>}
        {practiceLeaves.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
              <Dumbbell className="h-3.5 w-3.5" /> Practices
            </p>
            <ul className="space-y-2">{practiceLeaves.map(LeafRow)}</ul>
          </div>
        )}
      </>
    )
  }

  // ── The add-step controls + practice picker for a parent (a phase, or the loose section).
  //    A render function (not a component) so the search box keeps its state across renders. ──
  const stepTools = (parentId: string | null, pickerKey: string) => (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => addAndOpen(() => addLessonAction(slug, parentId, 'lesson'))}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-primary-strong hover:bg-primary-bg"
        >
          <Plus className="h-4 w-4" /> Add lesson
        </button>
        {practices.length > 0 && (
          <button
            type="button"
            onClick={() => { setPicker((v) => (v === pickerKey ? null : pickerKey)); setQuery('') }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-text"
          >
            <Dumbbell className="h-4 w-4" /> Add practice
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => addAndOpen(() => addExtraCreditAction(slug, parentId))}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-signal-strong hover:bg-signal-bg/50"
          title="A bonus task, above and beyond, that pays Zaps"
        >
          <Award className="h-4 w-4" /> Add extra credit
        </button>
      </div>
      {picker === pickerKey &&
        practicePicker(
          (practiceId) => addPractice(parentId, practiceId),
          () => { setPicker(null); setQuery('') },
        )}
    </>
  )

  const empty = phases.length === 0 && looseLeaves.length === 0

  return (
    <div className="space-y-4">
      {/* The Vera composer now lives full-width at the top of the editor shell (journey-builder),
          above this two-column body, so it is not rendered here. */}

      {/* Section header — identity/title + Vera live in the header above, so this is just the
          curriculum section's label. */}
      <header>
        <h2 className="text-base font-bold text-text">Curriculum</h2>
        <p className="text-sm text-muted">Add phases, then fill each with bite-sized lessons and practices.</p>
      </header>

      {empty && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Nothing here yet. Build it with Vera above, or add your first phase by hand.
        </p>
      )}

      {/* Loose steps (pre-v2 content with no phase) — editable, with a nudge to organize. */}
      {looseLeaves.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-1 flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-subtle" />
            <span className="text-base font-semibold text-text">Steps</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            These steps aren’t in a phase yet. Learners see them as one opening phase. Add phases below to group them into trophy milestones.
          </p>
          <ul className="space-y-2">{looseLeaves.map(LeafRow)}</ul>
          {stepTools(null, LOOSE_KEY)}
        </section>
      )}

      {phases.map((p) => {
        const phaseOpen = !closedPhases.has(p.id)
        const stepCount = lessonsOf(p.id).length + modulesOf(p.id).length
        return (
        <section key={p.id} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => togglePhase(p.id)}
              aria-expanded={phaseOpen}
              aria-label={phaseOpen ? 'Collapse phase' : 'Expand phase'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-subtle hover:text-text"
            >
              {phaseOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Layers className="h-4 w-4 shrink-0 text-subtle" />
            <input
              defaultValue={p.title}
              onBlur={(e) => run(() => updateBlockAction(slug, p.id, { title: e.target.value }))}
              className="min-w-[8rem] flex-1 rounded-lg border border-border bg-canvas px-1.5 py-1.5 text-base font-semibold text-text hover:border-border focus:border-primary focus:outline-none"
              placeholder="Phase title"
            />
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <span className="mr-1 whitespace-nowrap text-xs text-subtle">{stepCount} {stepCount === 1 ? 'step' : 'steps'}</span>
              <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, p.id, 'up'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, p.id, 'down'))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, p.id))} className="flex h-9 w-9 items-center justify-center rounded text-subtle hover:text-danger" aria-label="Delete phase"><Trash2 className="h-4 w-4" /></button>
            </span>
          </div>

          {phaseOpen && (
            <>
              {/* The week's focus (the arc) — Vera fills it from onboarding; editable here. */}
              <textarea
                defaultValue={p.body}
                onBlur={(e) => run(() => updateBlockAction(slug, p.id, { body: e.target.value }))}
                rows={2}
                placeholder="What this week is about (its focus). Optional."
                className="mt-3 w-full resize-y rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-muted focus:border-primary focus:outline-none"
              />
              {stepCount === 0 && (
                // An unfilled week: let Vera read the outline + earlier weeks and fill this one. She
                // pulls relevant library practices; the author can also add or create their own below.
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => populateWeekAction(slug, p.id))}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary-bg/30 px-3 py-2.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-bg disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" /> {pending ? 'Building…' : 'Populate this week with Vera'}
                  </button>
                  <p className="mt-1.5 text-center text-2xs text-subtle">Vera follows your outline and pulls matching practices from the library. Or add your own below.</p>
                </div>
              )}
              {renderLeaves(p.id)}
              {modulesOf(p.id).length > 0 && <div className="mt-2 space-y-2">{modulesOf(p.id).map(ModuleGroup)}</div>}
              {stepTools(p.id, p.id)}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => addModuleAction(slug, p.id))}
                className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated"
              >
                <Layers className="h-4 w-4" /> Add module
              </button>
            </>
          )}
        </section>
        )
      })}

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => addPhaseAction(slug))}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        <Plus className="h-4 w-4" /> Add phase
      </button>
    </div>
  )
}
