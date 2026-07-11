'use client'

// The Non Profit verification submit form (client · ADR-552, AUDIT #6). A Space owner enters the org's
// EIN + legal name and requests verification; the gated action records a pending request. Staff previewing
// (read-only) see the fields disabled. Strings are CONTENT-VOICE (plain, honest, no em dashes); semantic
// tokens only, no hardcoded hex.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { requestNonprofitVerification } from './actions'

export function VerifyForm({ slug, readOnly }: { slug: string; readOnly: boolean }) {
  const router = useRouter()
  const [ein, setEin] = useState('')
  const [orgLegalName, setOrgLegalName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (readOnly) return
    setError(null)
    start(async () => {
      const res = await requestNonprofitVerification(slug, { ein, orgLegalName })
      if (isError(res)) setError(res.error)
      else router.push(`/spaces/${slug}/settings/billing`)
    })
  }

  return (
    <fieldset disabled={readOnly || pending} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="org-legal-name">Legal organization name</Label>
        <Input
          id="org-legal-name"
          value={orgLegalName}
          onChange={(e) => setOrgLegalName(e.target.value)}
          placeholder="Bright Futures Inc"
          autoComplete="organization"
          maxLength={200}
        />
        <p className="text-2xs text-subtle">The name exactly as it appears on your IRS determination letter.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ein">EIN</Label>
        <Input
          id="ein"
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          placeholder="12-3456789"
          inputMode="numeric"
          maxLength={12}
        />
        <p className="text-2xs text-subtle">Your 9-digit Employer Identification Number. Dashes are fine.</p>
      </div>

      {/* An honest note on what happens next, so the button never over-promises (skeptic test). */}
      <Textarea
        aria-hidden
        readOnly
        tabIndex={-1}
        value="A person on our team checks your 501(c)(3) status against public records. You'll see the result here, usually within a few business days. Nothing changes on your plan until you're approved."
        className={`${fieldClasses} pointer-events-none resize-none text-xs text-muted`}
        rows={3}
      />

      {error && (
        <p className="text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={readOnly || pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
        {pending ? 'Sending' : 'Request verification'}
      </button>
    </fieldset>
  )
}
