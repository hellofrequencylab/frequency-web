'use client'

// Journeys v2 — the structure editor (ADR-252, J4b). A clean, structure-first builder: phases
// with bite-sized lessons (and optional library practices), edit title/type/content inline,
// reorder, delete, and live-preview in the player. Renders loose top-level steps too (existing
// pre-v2 journeys have steps with no phase) so nothing is ever hidden — matching the player,
// which wraps loose steps in an implicit phase. Calls the author-gated edit actions.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronUp, ChevronDown, Layers, Search, Dumbbell, X, Check, Sparkles, Award, Zap } from 'lucide-react'
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
} from '@/app/(main)/journeys/[slug]/edit/actions'
import { isError } from '@/lib/action-result'
import { JourneyComposer } from '@/components/journey/v2/journey-composer'
import type { CheckConfig } from '@/lib/journeys/store'

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
  /** Vera's per-slot coaching line (practice blocks), from settings.coaching_prompt. */
  coachingPrompt: string | null
  /** Extra-credit block (ADR-300 Part 2): a bonus task that pays Zaps, not a Pillar practice. */
  extraCredit: boolean
  /** Bonus Zaps paid on completing an extra-credit block. */
  bonusZaps: number
}

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
              <button type="button" disabled={disabled} onClick={() => { const o = cfg.options.filter((_, j) => j !== i); commit({ ...cfg, options: o, answer: Math.min(cfg.answer, o.length - 1) }) }} aria-label="Remove option" className="rounded p-1 text-subtle hover:text-danger">
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
  pillarName,
  disabled,
}: {
  slug: string
  itemId: string
  initialPrompt: string | null
  pillarName: string | null
  disabled: boolean
}) {
  const [value, setValue] = useState(initialPrompt ?? '')
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
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  )
}

export function JourneyEditor({
  slug,
  blocks,
  practices = [],
  pillars = [],
}: {
  slug: string
  blocks: EditorBlock[]
  practices?: EditorPractice[]
  pillars?: EditorPillar[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picker, setPicker] = useState<string | null>(null) // phase id, or LOOSE_KEY
  const [query, setQuery] = useState('')
  // Pillar facets for the practice selector: which Pillars are toggled on. Empty = all Pillars.
  // Unselected Pillars stay on screen (greyed), so the author sees the full set to choose from.
  const [pillarFilter, setPillarFilter] = useState<Set<string>>(new Set())
  const pillarNameById = new Map(pillars.map((p) => [p.id, p.name]))
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

  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder)
  const isLeaf = (b: EditorBlock) => b.blockType !== 'phase' && b.blockType !== 'module'
  const phases = sorted.filter((b) => b.blockType === 'phase' && b.parentId === null)
  const lessonsOf = (phaseId: string) => sorted.filter((b) => b.parentId === phaseId && isLeaf(b))
  const modulesOf = (phaseId: string) => sorted.filter((b) => b.parentId === phaseId && b.blockType === 'module')

  // A Module groups lessons into a session within a Phase (build item §11.1 #3). Own title +
  // its leaves + the same add-step tools. The player/tree already render Phase → Module → Lesson.
  const ModuleGroup = (m: EditorBlock) => (
    <div key={m.id} className="rounded-xl border border-border bg-canvas p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-subtle">Module</span>
        <input
          defaultValue={m.title}
          onBlur={(e) => run(() => updateBlockAction(slug, m.id, { title: e.target.value }))}
          placeholder="Module title"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm font-semibold text-text hover:border-border focus:border-primary focus:outline-none"
        />
        <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, m.id, 'up'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, m.id, 'down'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, m.id))} className="rounded p-1 text-subtle hover:text-danger" aria-label="Delete module"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <ul className="mt-2 space-y-2">{lessonsOf(m.id).map(LeafRow)}</ul>
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

  // ── A single editable step (lesson or practice) — used in phases and the loose section. ──
  const LeafRow = (l: EditorBlock) => {
    const isExtra = l.extraCredit
    const isPractice = !isExtra && l.blockType === 'practice'
    return (
      <li key={l.id} className={`rounded-xl border p-3 ${isExtra ? 'border-signal/30 bg-signal-bg/20' : 'border-border bg-canvas'}`}>
        <div className="flex items-center gap-2">
          {isExtra ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-signal/30 bg-signal-bg/60 px-1.5 py-1 text-xs font-medium text-signal-strong" title="Extra credit: a bonus task, above and beyond, that pays Zaps">
              <Award className="h-3.5 w-3.5" /> extra credit
            </span>
          ) : isPractice ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-1 text-xs font-medium text-muted" title="A library practice">
              <Dumbbell className="h-3.5 w-3.5" /> practice
            </span>
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
          <input
            defaultValue={l.title}
            onBlur={(e) => run(() => updateBlockAction(slug, l.id, { title: e.target.value }))}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-text hover:border-border focus:border-primary focus:outline-none"
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
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'up'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'down'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, l.id))} className="rounded p-1 text-subtle hover:text-danger" aria-label="Delete step"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
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
          <SlotCoaching
            slug={slug}
            itemId={l.id}
            initialPrompt={l.coachingPrompt}
            pillarName={l.domainId ? pillarNameById.get(l.domainId) ?? null : null}
            disabled={pending}
          />
        )}
      </li>
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
          onClick={() => run(() => addLessonAction(slug, parentId, 'lesson'))}
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
          onClick={() => run(() => addExtraCreditAction(slug, parentId))}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-signal-strong hover:bg-signal-bg/50"
          title="A bonus task, above and beyond, that pays Zaps"
        >
          <Award className="h-4 w-4" /> Add extra credit
        </button>
      </div>
      {picker === pickerKey && (
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
            <button type="button" onClick={() => { setPicker(null); setQuery('') }} aria-label="Close" className="rounded p-1 text-subtle hover:text-text"><X className="h-4 w-4" /></button>
          </div>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {pickList.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted">No practices match.</li>
            ) : (
              pickList.map((pr) => (
                <li key={pr.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => addPractice(parentId, pr.id)}
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
      )}
    </>
  )

  const empty = phases.length === 0 && looseLeaves.length === 0

  return (
    <div className="space-y-4">
      {/* Vera composer — the box at the top: describe the Journey and Vera fills a balanced
          opening week (Mind/Body/Spirit practice + two challenges). Always available; the empty
          shape preview shows only on a blank Journey. */}
      <JourneyComposer slug={slug} isEmpty={empty} />

      {/* Section header — the identity/title lives in the Details tab, and Preview + Done live in
          the builder bar above, so this is just the curriculum section's label. */}
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

      {phases.map((p) => (
        <section key={p.id} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-subtle" />
            <input
              defaultValue={p.title}
              onBlur={(e) => run(() => updateBlockAction(slug, p.id, { title: e.target.value }))}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-base font-semibold text-text hover:border-border focus:border-primary focus:outline-none"
              placeholder="Phase title"
            />
            <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, p.id, 'up'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, p.id, 'down'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, p.id))} className="rounded p-1 text-subtle hover:text-danger" aria-label="Delete phase"><Trash2 className="h-4 w-4" /></button>
          </div>

          <ul className="mt-3 space-y-2">{lessonsOf(p.id).map(LeafRow)}</ul>
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
        </section>
      ))}

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
