'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MentionTextarea, tagLabel, type MentionPerson } from '@/components/mentions/mention-textarea'
import { MessageText } from '@/components/mentions/message-text'
import { isError } from '@/lib/action-result'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { firstUnreadId, threadTopic, type ItemSubjectType } from '@/lib/threads/subjects'
import { loadItemThread, markThreadRead, postItemComment, removeItemComment, type ItemCommentView } from '@/lib/threads/actions'
import { useThreadLive } from './use-thread-live'

// THE TEAM THREAD UNDER AN EVENT, A DEAL OR A CONTACT (LIVE-2527). Oldest first, the composer under
// the latest word, the same shape as the thread under a Plan. New words arrive live (LIVE-2528) and
// a "New" line marks the first one the reader has not seen; opening the thread marks it read.
// Typing @ tags a teammate, # links a Plan, to-do, event, deal or contact.

export function ItemThread({
  subjectType,
  subjectId,
  spaceId,
  people = [],
  placeholder = 'Write to your team',
}: {
  subjectType: ItemSubjectType
  subjectId: string
  spaceId: string
  people?: readonly MentionPerson[]
  placeholder?: string
}) {
  const [pending, start] = useTransition()
  const [comments, setComments] = useState<ItemCommentView[] | null>(null)
  const [unreadId, setUnreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const names = new Map(people.map((p) => [p.value, tagLabel(p.label)]))

  const load = useCallback(
    async (markRead: boolean) => {
      const res = await loadItemThread(subjectType, subjectId, spaceId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setComments(res.data.comments)
      setUnreadId(firstUnreadId(res.data.comments, res.data.lastReadAt, res.data.me))
      if (markRead) await markThreadRead(subjectType, subjectId)
    },
    [subjectType, subjectId, spaceId],
  )

  useEffect(() => {
    // The first read of the thread happens once on mount; setState lands after the await.
    let live = true
    void (async () => {
      if (live) await load(true)
    })()
    return () => {
      live = false
    }
  }, [load])

  const onLive = useCallback(() => {
    void load(true)
  }, [load])
  useThreadLive(threadTopic(subjectType, subjectId), onLive)

  const post = () => {
    if (pending || !draft.trim()) return
    setError(null)
    start(async () => {
      const res = await postItemComment(subjectType, subjectId, spaceId, draft)
      if (isError(res)) setError(res.error)
      else {
        setDraft('')
        await load(false)
      }
    })
  }

  const takeBack = (id: string) => {
    setError(null)
    start(async () => {
      const res = await removeItemComment(id)
      if (isError(res)) setError(res.error)
      else await load(false)
    })
  }

  return (
    <div className="space-y-2" data-item-thread={`${subjectType}:${subjectId}`}>
      {comments && comments.length > 0 && (
        <ul className="space-y-2 text-body-sm text-text">
          {comments.map((c) => (
            <li key={c.id} className="space-y-2">
              {c.id === unreadId && (
                <p className="text-meta font-semibold text-primary-strong" data-thread-new>
                  New
                </p>
              )}
              <div className="rounded-control border border-border px-3 py-2">
                <p className="text-meta text-muted">
                  {c.mine ? 'You' : c.authorName}
                  {` · ${shortDateLabel(c.createdAt)}`}
                </p>
                {c.removed ? (
                  <p className="text-muted">Taken back.</p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
      {comments && comments.length === 0 && <p className="text-body-sm text-muted">Nothing here yet. Start the conversation.</p>}
      <div className="grid gap-1">
        <MentionTextarea
          aria-label={placeholder}
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

/** A deal's thread opens on demand, so a contact with many deals loads none until asked. */
export function ItemThreadToggle(props: Parameters<typeof ItemThread>[0] & { label?: string }) {
  const [open, setOpen] = useState(false)
  const { label = 'Discuss', ...rest } = props
  return (
    <div className="w-full">
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide thread' : label}
      </Button>
      {open && (
        <div className="mt-2">
          <ItemThread {...rest} />
        </div>
      )}
    </div>
  )
}
