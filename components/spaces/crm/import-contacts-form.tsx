'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { importContactsToSpace } from '@/lib/crm/graduation-actions'

// BRING YOUR CONTACTS INTO YOUR SPACE CRM (CRM-STRATEGY §6, P3). The owner-only entry point for
// graduation. An optional status / tag filter narrows which personal contacts come in; the server is
// authoritative (it re-checks the owner gate + the crm entitlement and dedupes), so this form is
// convenience. After a run it shows a plain count and refreshes the board.
//
// Voice (CONTENT-VOICE §10): plain sentences, an honest result count, no narrated feelings, no em or
// en dashes. The status select uses the same lifecycle labels as My Contacts (New / Active / Archived).

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const

export function ImportContactsForm({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [tag, setTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number; total: number } | null>(null)
  const [pending, startImport] = useTransition()

  function run() {
    setError(null)
    setResult(null)
    startImport(async () => {
      const res = await importContactsToSpace(spaceId, {
        status: status || undefined,
        tag: tag.trim() || undefined,
      })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setResult(res.data)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Users className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">Bring your contacts into your Space CRM</h3>
          <p className="mt-0.5 text-xs text-muted">
            Copy the people from My Contacts into this space, with a deal started for each one. We skip
            anyone you have already brought in. Your private My Contacts list stays as it is.
          </p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) run()
        }}
      >
        <div>
          <Label htmlFor="grad-status" className="text-xs font-semibold">
            Status
          </Label>
          <select
            id="grad-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="grad-tag" className="text-xs font-semibold">
            Tag (optional)
          </Label>
          <Input
            id="grad-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. client"
            maxLength={60}
            className="mt-1 w-44"
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Bringing them in
            </>
          ) : (
            <>
              <Users className="h-4 w-4" aria-hidden /> Bring contacts in
            </>
          )}
        </Button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {result && !pending && (
        <p
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-2 text-sm font-medium text-success"
          role="status"
        >
          <Check className="h-4 w-4" aria-hidden />
          {result.imported > 0
            ? `Brought in ${result.imported} ${result.imported === 1 ? 'contact' : 'contacts'}.`
            : 'Nothing new to bring in.'}
          {result.skipped > 0 ? ` Skipped ${result.skipped} already in or without an email.` : ''}
        </p>
      )}
    </section>
  )
}
