'use client'

// Journeys v2 — the structure editor (ADR-252, J4b). A clean, structure-first builder: phases
// with bite-sized lessons (and optional library practices), edit title/type/content inline,
// reorder, delete, and live-preview in the player. Renders loose top-level steps too (existing
// pre-v2 journeys have steps with no phase) so nothing is ever hidden — matching the player,
// which wraps loose steps in an implicit phase. Calls the author-gated edit actions.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, Layers, Search, Dumbbell, X, Check, Sparkles } from 'lucide-react'
import {
  addPhaseAction,
  addModuleAction,
  addLessonAction,
  addPracticeBlockAction,
  updateBlockAction,
  removeBlockAction,
  moveBlockAction,
  draftOutlineAction,
} from '@/app/(main)/journeys/[slug]/edit/actions'
import { isError } from '@/lib/action-result'
import type { CheckConfig } from '@/lib/journeys/store'

// Vera's "draft my outline" panel (build item §11.1 #4): describe the Journey in a sentence and
// Vera drafts the Phase -> Lesson structure. Shown on the blank-start path; the author edits from
// there. Self-contained state; the action inserts the blocks and the editor re-renders on refresh.
function VeraOutline({ slug }: { slug: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const draft = () => {
    setError(null)
    start(async () => {
      const res = await draftOutlineAction(slug, desc)
      if (isError(res)) setError(res.error ?? 'Vera could not draft an outline.')
      else {
        setDesc('')
        router.refresh()
      }
    })
  }
  return (
    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary-bg/30 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-strong" />
        <p className="text-sm font-semibold text-text">Draft an outline with Vera</p>
      </div>
      <p className="mt-1 text-sm text-muted">Describe the Journey in a sentence or two. Vera drafts the Phases and lessons; you edit from there.</p>
      <textarea
        value={desc}
        disabled={pending}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
        placeholder="e.g. A 3-week reset for people who want to read more and scroll less."
        className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <button
        type="button"
        disabled={pending || !desc.trim()}
        onClick={draft}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" /> {pending ? 'Drafting…' : 'Draft with Vera'}
      </button>
    </div>
  )
}

export interface EditorBlock {
  id: string
  parentId: string | null
  blockType: string
  title: string
  body: string
  sortOrder: number
  /** Knowledge-check config for `check` blocks (build item §11.1 #2), else null. */
  check: CheckConfig | null
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
}

const LEAF_TYPES = ['lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource'] as const
const LOOSE_KEY = '__loose__'

export function JourneyEditor({
  slug,
  blocks,
  practices = [],
}: {
  slug: string
  blocks: EditorBlock[]
  practices?: EditorPractice[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picker, setPicker] = useState<string | null>(null) // phase id, or LOOSE_KEY
  const [query, setQuery] = useState('')
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
    .filter((p) => !term || (p.title + ' ' + (p.description ?? '')).toLowerCase().includes(term))
    .slice(0, 30)

  const addPractice = (parentId: string | null, practiceId: string) => {
    setPicker(null)
    setQuery('')
    run(() => addPracticeBlockAction(slug, parentId, practiceId))
  }

  // ── A single editable step (lesson or practice) — used in phases and the loose section. ──
  const LeafRow = (l: EditorBlock) => {
    const isPractice = l.blockType === 'practice'
    return (
      <li key={l.id} className="rounded-xl border border-border bg-canvas p-3">
        <div className="flex items-center gap-2">
          {isPractice ? (
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
            placeholder={isPractice ? 'Practice step' : 'Lesson title'}
          />
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'up'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => moveBlockAction(slug, l.id, 'down'))} className="rounded p-1 text-subtle hover:text-text" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={pending} onClick={() => run(() => removeBlockAction(slug, l.id))} className="rounded p-1 text-subtle hover:text-danger" aria-label="Delete step"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <textarea
          defaultValue={l.body}
          onBlur={(e) => run(() => updateBlockAction(slug, l.id, { body: e.target.value }))}
          rows={2}
          placeholder={isPractice ? 'A note for this practice step (optional).' : 'Lesson content (markdown). Paste a YouTube/Vimeo/video link to embed it.'}
          className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
        />
        {l.blockType === 'check' && (
          <CheckEditor
            initial={l.check}
            disabled={pending}
            onSave={(cfg) => run(() => updateBlockAction(slug, l.id, { check: cfg }))}
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
      </div>
      {picker === pickerKey && (
        <div className="mt-2 rounded-xl border border-border bg-canvas p-2">
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
      {/* Section header — the identity/title lives in the Settings card above, so this is just
          the structure section's label, not a second page title. */}
      <header className="flex items-end justify-between gap-3 border-t border-border pt-4">
        <div>
          <h2 className="text-base font-bold text-text">Structure</h2>
          <p className="text-sm text-muted">Add phases, then fill each with bite-sized lessons and practices.</p>
        </div>
        <Link
          href={`/journeys/${slug}/learn`}
          target="_blank"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated"
        >
          <Eye className="h-4 w-4" /> Preview
        </Link>
      </header>

      {empty && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Nothing here yet. Add your first phase, then fill it with lessons.
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

      {empty && <VeraOutline slug={slug} />}

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
