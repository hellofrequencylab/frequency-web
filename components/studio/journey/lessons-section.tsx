'use client'

import { BookOpen, Heading1, Plus, Trash2 } from 'lucide-react'

// The editor's Lessons section (docs/JOURNEYS.md §5A, ADR-244). The e-learning half of
// authoring: alongside the practice path, an author adds LESSON blocks (title + markdown
// body — a reading or a video's notes) and SECTION headers. v1 keeps this a SEPARATE list
// that renders after the practices in the course; free interleaving + reorder is a follow-up.
// Presentational: state + persistence live in the JourneyBuilder, which feeds these into the
// live preview too.

export interface BuilderBlock {
  /** journey_plan_items.id */
  id: string
  blockType: 'lesson' | 'section'
  title: string
  body: string
}

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'

export function LessonsSection({
  blocks,
  busy,
  onAdd,
  onChange,
  onSave,
  onDelete,
}: {
  blocks: BuilderBlock[]
  /** Disables the add buttons while a create is in flight. */
  busy?: boolean
  onAdd: (kind: 'lesson' | 'section') => void
  onChange: (id: string, patch: Partial<BuilderBlock>) => void
  /** Persist the block's current title/body (called on blur). */
  onSave: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">
          Lessons · {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd('section')}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
          >
            <Heading1 className="h-3.5 w-3.5" /> Section
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd('lesson')}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Lesson
          </button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-5 py-6 text-center">
          <BookOpen className="mx-auto mb-2 h-6 w-6 text-subtle" />
          <p className="text-sm font-medium text-text">Teach it, don&apos;t just list it</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Add a lesson (a reading or a video&apos;s notes) or a section header. Learners check
            each one off in the course.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b) =>
            b.blockType === 'section' ? (
              <li key={b.id} className="flex items-center gap-2 rounded-xl bg-surface-elevated px-3 py-2">
                <Heading1 className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-text outline-none placeholder:text-subtle"
                  placeholder="Section title"
                  value={b.title}
                  onChange={(e) => onChange(b.id, { title: e.target.value })}
                  onBlur={() => onSave(b.id)}
                />
                <DeleteButton onClick={() => onDelete(b.id)} />
              </li>
            ) : (
              <li key={b.id} className="space-y-2 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text outline-none placeholder:text-subtle"
                    placeholder="Lesson title"
                    value={b.title}
                    onChange={(e) => onChange(b.id, { title: e.target.value })}
                    onBlur={() => onSave(b.id)}
                  />
                  <DeleteButton onClick={() => onDelete(b.id)} />
                </div>
                <textarea
                  className={`${field} resize-y`}
                  rows={3}
                  placeholder="What's the lesson? Paste a video link or write the reading."
                  value={b.body}
                  onChange={(e) => onChange(b.id, { body: e.target.value })}
                  onBlur={() => onSave(b.id)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Delete block"
      className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-error-bg hover:text-error"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
