'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import {
  createSpaceCampaign,
  updateSpaceCampaign,
  scheduleSpaceCampaign,
  sendSpaceCampaign,
} from '@/lib/spaces/campaigns-actions'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { AudiencePicker } from '@/components/spaces/email/audience-picker'

// CAMPAIGN COMPOSER (ENTITY-SPACES-BUILD §C Phase 3). Mirrors the global composer pattern
// (app/(main)/admin/marketing/campaigns/campaign-composer.tsx): a subject + a plain-text body where
// blank lines become paragraphs, the same block/compose approach with KIT primitives (Input /
// Textarea / Button). It adds the per-Space AUDIENCE picker (all contacts or by tag, with a live
// count) and a Send / Schedule control.
//
// FLOW: the composer first CREATES a draft (createSpaceCampaign) so the campaign has an id, then SENDS
// or SCHEDULES that id. The send action resolves the audience over the Space's own contacts and hands
// it to the send backbone (which owns the kill-switch, daily cap, suppression, and per-recipient
// unsubscribe). Sending stays disabled until email is enabled for the Space (the enable gate lives on
// the page; this composer is only rendered once email is on, or with sending disabled in preview).
//
// Copy passes CONTENT-VOICE: plain labels, concrete, no narrated feelings, no em/en dashes.

export function ComposerShell({
  spaceId,
  slug,
  tags,
  canSend,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  /** Tags available to filter the audience by. */
  tags: string[]
  /** Whether sending is available (email enabled for the Space). When false, Send/Schedule are off. */
  canSend: boolean
  /** A staff preview renders the whole composer read-only. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState<AudienceFilter>({ tag: null })
  const [count, setCount] = useState<number>(0)
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ready = subject.trim().length > 0 && body.trim().length > 0
  const disabled = readOnly || pending

  // Ensure the draft exists, returning its id (or null on failure, with the error surfaced).
  async function ensureDraft(): Promise<string | null> {
    const res = await createSpaceCampaign(spaceId, slug, { subject, body })
    if (isError(res)) {
      setError(res.error)
      return null
    }
    // Keep the body in sync (a create stores the current text); update is a no-op here but keeps the
    // edit path honest if the owner tweaks before sending.
    await updateSpaceCampaign(spaceId, slug, res.data.id, { subject, body })
    return res.data.id
  }

  function handleSend() {
    if (!ready || disabled) return
    setError(null)
    setNotice(null)
    start(async () => {
      const id = await ensureDraft()
      if (!id) return
      const res = await sendSpaceCampaign(spaceId, slug, id, filter)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice('Your campaign is on its way.')
      router.refresh()
    })
  }

  function handleSchedule() {
    if (!ready || disabled || !when) return
    setError(null)
    setNotice(null)
    start(async () => {
      const id = await ensureDraft()
      if (!id) return
      const res = await scheduleSpaceCampaign(spaceId, slug, id, when)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice('Scheduled. We will send it then.')
      setSubject('')
      setBody('')
      setWhen('')
      router.refresh()
    })
  }

  // A min for the schedule input: a few minutes out (so the picker discourages a past time; the
  // server is the real gate). Computed once via a lazy state initializer (reading the clock during
  // render is impure; the initializer runs once at mount). datetime-local wants a local
  // YYYY-MM-DDTHH:mm with no seconds / zone.
  const [minWhen] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  return (
    <fieldset disabled={disabled} className="contents">
      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div>
            <Label htmlFor="campaign-subject" className="font-semibold">
              Subject
            </Label>
            <Input
              id="campaign-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              maxLength={200}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="campaign-body" className="font-semibold">
              Message
            </Label>
            <Textarea
              id="campaign-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message. Leave a blank line between paragraphs."
              rows={10}
              className="mt-1 resize-y"
            />
            <p className="mt-1 text-xs text-subtle">
              Blank lines become paragraphs. We add an unsubscribe link to every email.
            </p>
          </div>
        </div>

        <AudiencePicker
          spaceId={spaceId}
          tags={tags}
          filter={filter}
          onFilterChange={setFilter}
          onCountChange={setCount}
          disabled={disabled}
        />

        {!canSend && (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted">
            Turn email on above to send or schedule.
          </p>
        )}

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-semibold text-text">Send</p>

          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              onClick={handleSend}
              disabled={!ready || disabled || !canSend || count === 0}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Working
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden /> Send now
                </>
              )}
            </Button>

            <span className="text-xs text-subtle">or</span>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Schedule for</span>
              {/* Kit Input carries type="datetime-local" (it forwards all input attrs), so the picker
                  reuses the one focus/border token set instead of re-declaring it. */}
              <Input
                type="datetime-local"
                value={when}
                min={minWhen}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>

            <Button
              type="button"
              variant="secondary"
              onClick={handleSchedule}
              disabled={!ready || disabled || !canSend || !when || count === 0}
            >
              <Clock className="h-4 w-4" aria-hidden /> Schedule
            </Button>
          </div>

          {error && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          {notice && !error && (
            <p
              className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-2 text-sm font-medium text-success"
              role="status"
            >
              <Check className="h-4 w-4" aria-hidden /> {notice}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  )
}
