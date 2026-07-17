'use client'

// "Follow up" affordance from a contact (ADR-628/627): one tap files a CRM task tied to this contact,
// so an operator reading a conversation can queue a follow-up without leaving the thread. It calls the
// same staff-gated createTaskAction the Tasks board uses. Reusable anywhere a contactId is in hand.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createTaskAction } from '@/app/(main)/admin/crm/tasks/actions'

export function FollowUpButton({
  contactId,
  contactName,
  className,
}: {
  contactId: string
  contactName?: string | null
  className?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  function add() {
    start(async () => {
      const who = contactName?.trim() || 'this contact'
      const res = await createTaskAction({
        title: `Follow up with ${who}`,
        contactId,
        dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), // two days out
      })
      if (!isError(res)) {
        setDone(true)
        router.refresh()
        setTimeout(() => setDone(false), 2500)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={pending || done}
      title="File a follow-up task for this contact"
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-60 ${className ?? ''}`}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : done ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <CalendarPlus className="size-3.5" />
      )}
      {done ? 'Follow-up added' : 'Follow up'}
    </button>
  )
}
