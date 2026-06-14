'use client'

// Journeys v2 — the structure editor (ADR-252, J4b). A clean, structure-first builder: phases
// with bite-sized lessons (and optional library practices), edit title/type/content inline,
// reorder, delete, and live-preview in the player. Not drag-drop yet (up/down is robust); module
// nesting is refined later. Calls the author-gated edit actions and refreshes from the server tree.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, Layers, Search, Dumbbell, X } from 'lucide-react'
import {
  addPhaseAction,
  addLessonAction,
  addPracticeBlockAction,
  updateBlockAction,
  removeBlockAction,
  moveBlockAction,
} from '@/app/(main)/journeys/[slug]/edit/actions'

export interface EditorBlock {
  id: string
  parentId: string | null
  blockType: string
  title: string
  body: string
  sortOrder: number
}

export interface EditorPractice {
  id: string
  title: string
  description: string | null
}

const LEAF_TYPES = ['lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource'] as const

export function JourneyEditor({
  slug,
  title,
  blocks,
  practices = [],
}: {
  slug: string
  title: string
  blocks: EditorBlock[]
  practices?: EditorPractice[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [pickerPhase, setPickerPhase] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder)
  const phases = sorted.filter((b) => b.blockType === 'phase' && b.parentId === null)
  const lessonsOf = (phaseId: string) =>
    sorted.filter((b) => b.parentId === phaseId && b.blockType !== 'phase' && b.blockType !== 'module')

  // Don't offer a practice that's already a step in this journey (match by title).
  const used = new Set(blocks.filter((b) => b.blockType === 'practice').map((b) => b.title))
  const term = query.trim().toLowerCase()
  const pickList = practices
    .filter((p) => !used.has(p.title))
    .filter((p) => !term || (p.title + ' ' + (p.description ?? '')).toLowerCase().includes(term))
    .slice(0, 30)

  const addPractice = (phaseId: string, practiceId: string) => {
    setPickerPhase(null)
    setQuery('')
    run(() => addPracticeBlockAction(slug, phaseId, practiceId))
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">{title}</h1>
          <p className="text-sm text-muted">Build your journey — add phases, then bite-sized lessons (and practices) in each.</p>
        </div>
        <Link
          href={`/journeys/${slug}/learn`}
          target="_blank"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated"
        >
          <Eye className="h-4 w-4" /> Preview
        </Link>
      </header>

      {phases.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No phases yet. Add your first phase to get started.
        </p>
      )}

      {phases.map((p) => {
        const lessons = lessonsOf(p.id)
        return (
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

            <ul className="mt-3 space-y-2">
              {lessons.map((l) => {
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
                  </li>
                )
              })}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => addLessonAction(slug, p.id, 'lesson'))}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-primary-strong hover:bg-primary-bg"
              >
                <Plus className="h-4 w-4" /> Add lesson
              </button>
              {practices.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setPickerPhase((v) => (v === p.id ? null : p.id)); setQuery('') }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-text"
                >
                  <Dumbbell className="h-4 w-4" /> Add practice
                </button>
              )}
            </div>

            {/* Practice picker */}
            {pickerPhase === p.id && (
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
                  <button type="button" onClick={() => { setPickerPhase(null); setQuery('') }} aria-label="Close" className="rounded p-1 text-subtle hover:text-text"><X className="h-4 w-4" /></button>
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
                          onClick={() => addPractice(p.id, pr.id)}
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
