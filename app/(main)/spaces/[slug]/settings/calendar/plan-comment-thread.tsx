'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MentionTextarea, tagLabel, type MentionPerson } from '@/components/mentions/mention-textarea'
import { MessageText } from '@/components/mentions/message-text'
import { isError } from '@/lib/action-result'
import { REMOVED_WORDS, authorWords, threadFor, type PlanCommentView } from '@/lib/calendar/plan-comments'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { postPlanComment, removePlanComment } from './plan-actions'

// ONE THREAD (PROG-CAL7 Together, LIVE-542): the Plan's own when taskId is null, or the thread
// under one to-do. Oldest first, the composer under the latest word. Both sides of a share render
// this: the host in its drawer, the guest in the same drawer opened read only, because the thread
// is the one door the guest has from the start. A taken-back comment stays as a line that says so.
// The composer is a textarea so Enter is a new line and never the Plan form's submit. Typing @
// tags someone who works the Plan (LIVE-2524): they hear about it by name.

export function PlanCommentThread({
  slug,
  planId,
  taskId,
  comments,
  onChanged,
  placeholder,
  people = [],
}: {
  slug: string
  planId: string
  taskId: string | null
  comments: PlanCommentView[]
  onChanged: () => Promise<void> | void
  placeholder: string
  /** The people who work the Plan, offered when the writer types @. */
  people?: readonly MentionPerson[]
}) {
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const thread = threadFor(comments, taskId)
  const label = taskId ? 'Write a note on this to-do' : 'Write a comment'
  const names = new Map(people.map((p) => [p.value, tagLabel(p.label)]))

  const post = () => {
    if (pending || !draft.trim()) return
    setError(null)
    start(async () => {
      const res = await postPlanComment(slug, planId, taskId, draft)
      if (isError(res)) setError(res.error)
      else {
        setDraft('')
        await onChanged()
      }
    })
  }

  const takeBack = (commentId: string) => {
    setError(null)
    start(async () => {
      const res = await removePlanComment(slug, planId, commentId)
      if (isError(res)) setError(res.error)
      else await onChanged()
    })
  }

  return (
    <div className="space-y-2" data-plan-thread={taskId ?? 'plan'}>
      {thread.length > 0 && (
        <ul className="space-y-2 text-body-sm text-text" data-plan-thread-list>
          {thread.map((c) => (
            <li key={c.id} className="rounded-control border border-border px-3 py-2" data-plan-comment={c.id}>
              <p className="text-meta text-muted">
                {authorWords(c)}
                {` · ${shortDateLabel(c.createdAt)}`}
              </p>
              {c.removed ? (
                <p className="text-muted">{REMOVED_WORDS}</p>
              ) : (
                <p className="whitespace-pre-wrap">
                  <MessageText body={c.body} names={names} />
                </p>
              )}
              {c.mine && !c.removed && (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => takeBack(c.id)}>
                  Take back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-1">
        <MentionTextarea
          aria-label={label}
          rows={2}
          value={draft}
          placeholder={placeholder}
          disabled={pending}
          onValueChange={setDraft}
          people={people}
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="secondary" disabled={pending || !draft.trim()} onClick={post}>
            Post
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
