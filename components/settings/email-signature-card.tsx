'use client'

// Edit + save your email signature (appended to outbound conversation replies). Empty = the auto default
// ("<your name> · frequencylocal.com"). The placeholder shows that default so the field never looks blank.

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { updateEmailSignatureAction } from '@/app/(main)/settings/profile/signature-actions'

export function EmailSignatureCard({ initial, autoDefault }: { initial: string; autoDefault: string }) {
  const [value, setValue] = useState(initial)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const r = await updateEmailSignatureAction(value)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-text">Email signature</h2>
      <p className="mt-1 text-sm text-muted">
        Added to the bottom of the emails you send from your inbox. Leave it blank to use the default below.
      </p>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        rows={4}
        placeholder={autoDefault}
        className="mt-3 w-full resize-none rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-2xs text-subtle">
          Default: <span className="whitespace-pre-wrap">{autoDefault.replace(/\n/g, ' · ')}</span>
        </p>
        <div className="flex items-center gap-2">
          {saved && !pending && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-success">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save signature
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
