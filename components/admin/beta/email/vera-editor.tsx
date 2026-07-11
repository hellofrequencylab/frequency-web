'use client'

// Vera's beta email copy editor (Wave 2). Propose → edit → approve, the creator-tips
// model: Vera drafts or refines copy through withVoice(), the result is linted against
// the voice canon (em dashes and vibe-verbs surfaced), and the operator copies it into
// a campaign. Vera NEVER sends and nothing she writes is auto-armed. When AI is off she
// fails friendly and the operator writes by hand.

import { useState, useTransition } from 'react'
import { Wand2, AlertTriangle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { VoiceViolation } from '@/lib/beta/email'
import { draftBetaCopy } from '@/app/(main)/admin/beta/email-actions'

const field =
  'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text placeholder:text-subtle'

export function VeraEditor() {
  const [brief, setBrief] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [violations, setViolations] = useState<VoiceViolation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const hasDraft = Boolean(subject || body)

  function generate(mode: 'draft' | 'refine') {
    setError(null)
    setCopied(false)
    start(async () => {
      const r = await draftBetaCopy({ mode, brief, existing: mode === 'refine' ? `${subject}\n\n${body}` : undefined })
      if (isError(r)) {
        setError(r.error)
        return
      }
      setSubject(r.data.subject)
      setBody(r.data.body)
      setViolations(r.data.violations)
    })
  }

  function reLint() {
    // Re-lint the operator's edits client-side is not possible (lint is server pure);
    // clearing violations after an edit avoids showing stale findings. The server
    // re-lints on Mark ready, which is the gate that actually matters.
    setViolations([])
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setCopied(true)
    } catch {
      setError('Could not copy. Select the text and copy it by hand.')
    }
  }

  const hasEmDash = violations.some((v) => v.rule === 'em-dash')

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary-strong" aria-hidden />
        <h3 className="text-sm font-bold text-text">Draft with Vera</h3>
      </div>
      <p className="text-xs text-muted">
        Tell Vera what the email is for. She writes to the voice, you edit, then paste it into a campaign. She never
        sends.
      </p>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={2}
        placeholder="e.g. invite the waitlist to create their account now that their city is open"
        className={`${field} resize-y`}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => generate('draft')}>
          <Wand2 className="h-3.5 w-3.5" /> {pending ? 'Writing…' : 'Draft copy'}
        </Button>
        {hasDraft && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => generate('refine')}>
            Refine this
          </Button>
        )}
      </div>

      {error && (
        <Banner tone="critical" title="Vera could not help just now">
          {error}
        </Banner>
      )}

      {hasDraft && (
        <div className="space-y-2">
          <input value={subject} onChange={(e) => { setSubject(e.target.value); reLint() }} className={field} placeholder="Subject" />
          <textarea value={body} onChange={(e) => { setBody(e.target.value); reLint() }} rows={8} className={`${field} resize-y`} placeholder="Body" />

          {violations.length > 0 && (
            <Banner
              tone={hasEmDash ? 'critical' : 'warning'}
              title={hasEmDash ? 'Voice check: fix before you use this' : 'Voice check: worth a look'}
            >
              <ul className="mt-1 space-y-0.5">
                {violations.map((v, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {v.detail}
                  </li>
                ))}
              </ul>
            </Banner>
          )}

          <Button size="sm" variant="secondary" onClick={copyAll}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy for a campaign'}
          </Button>
        </div>
      )}
    </div>
  )
}
