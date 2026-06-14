'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { EventQuestion, QuestionType } from '@/lib/events/questions'
import {
  createEventQuestion,
  updateEventQuestion,
  deleteEventQuestion,
} from './actions'

// Questionnaire authoring for the host (EVENTS-REWORK A1/A2). Add, edit, and
// remove the questions a guest answers at RSVP time. Six types; the two choice
// types (dropdown / multi-select) reveal an options box. Saves through the server
// actions, which re-authorize the caller as host/cohost. Voice: plain prompts,
// never narrates feelings, no em dashes.

const TYPE_LABEL: Record<QuestionType, string> = {
  short_text: 'Short answer',
  long_text: 'Long answer',
  dropdown: 'Pick one',
  multi_select: 'Pick several',
  boolean: 'Yes or no',
  number: 'Number',
}

const TYPE_ORDER: QuestionType[] = [
  'short_text',
  'long_text',
  'dropdown',
  'multi_select',
  'boolean',
  'number',
]

const CHOICE_TYPES: QuestionType[] = ['dropdown', 'multi_select']

export function QuestionEditor({
  eventId,
  slug,
  questions,
}: {
  eventId: string
  slug: string
  questions: EventQuestion[]
}) {
  const [editing, setEditing] = useState<EventQuestion | 'new' | null>(null)
  const [pending, start] = useTransition()

  const onDelete = (q: EventQuestion) => {
    if (!confirm(`Remove "${q.prompt}"? Any answers to it are removed too.`)) return
    start(() => deleteEventQuestion(eventId, slug, q.id))
  }

  return (
    <div className="space-y-3">
      {questions.length === 0 ? (
        <EmptyState
          title="No questions yet"
          description="Ask guests what you need to know when they RSVP. Dietary needs, a song request, a plus-one name. Answers stay private to you."
          action={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" />
              Add a question
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {questions.map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-4 py-3">
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    {q.prompt}
                    {q.required && <span className="ml-1.5 text-xs text-danger">required</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {TYPE_LABEL[q.type]}
                    {CHOICE_TYPES.includes(q.type) && q.options.length > 0 && (
                      <span> · {q.options.join(', ')}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(q)}
                    aria-label="Edit question"
                    className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(q)}
                    disabled={pending}
                    aria-label="Remove question"
                    className="rounded-lg p-1.5 text-subtle transition-colors hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" />
            Add a question
          </Button>
        </>
      )}

      {editing && (
        <QuestionDialog
          eventId={eventId}
          slug={slug}
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function QuestionDialog({
  eventId,
  slug,
  question,
  onClose,
}: {
  eventId: string
  slug: string
  question: EventQuestion | null
  onClose: () => void
}) {
  const [type, setType] = useState<QuestionType>(question?.type ?? 'short_text')
  const [pending, start] = useTransition()
  const isEdit = question != null

  const onSubmit = (formData: FormData) => {
    start(async () => {
      if (isEdit) {
        await updateEventQuestion(eventId, slug, question.id, formData)
      } else {
        await createEventQuestion(eventId, slug, formData)
      }
      onClose()
    })
  }

  return (
    <Dialog open onClose={onClose} className="max-w-lg" ariaLabel={isEdit ? 'Edit question' : 'Add question'}>
      <form
        action={onSubmit}
        className="rounded-2xl border border-border bg-surface p-5 shadow-lg"
      >
        <h3 className="mb-4 text-base font-bold text-text">
          {isEdit ? 'Edit question' : 'Add a question'}
        </h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="q-prompt">Question</Label>
            <Input
              id="q-prompt"
              name="prompt"
              defaultValue={question?.prompt ?? ''}
              placeholder="What should guests tell you?"
              maxLength={200}
              required
              autoFocus
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="q-type">Answer type</Label>
            <select
              id="q-type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className={cn(fieldClasses, 'mt-1')}
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {CHOICE_TYPES.includes(type) && (
            <div>
              <Label htmlFor="q-options">Choices</Label>
              <Textarea
                id="q-options"
                name="options"
                defaultValue={question?.options.join('\n') ?? ''}
                placeholder={'One per line\nor comma-separated'}
                rows={4}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-subtle">One choice per line, or separated by commas.</p>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="required"
              defaultChecked={question?.required ?? false}
              className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
            />
            <span className="text-sm text-text">Require an answer to RSVP</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save question' : 'Add question'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
