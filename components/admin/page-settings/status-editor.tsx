'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { getPageStatusForEditor, savePageStatus } from '@/lib/page-settings/actions'
import { VISIBILITY_ROLES } from '@/lib/page-settings/status'

// The live Status & visibility editor for the on-page "Page" settings panel (ADR-269).
// Draft hides the page from everyone but staff (who can still preview it); visibility sets
// the lowest community rung that may reach it. Enforced fail-safe in (main)/layout.tsx.

const ROLE_LABEL: Record<string, string> = {
  crew: 'Crew and up',
  host: 'Hosts and up',
  guide: 'Guides and up',
  mentor: 'Mentors and up',
}

export function StatusEditor() {
  const pathname = usePathname()
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [visibility, setVisibility] = useState('') // '' = anyone signed in
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPageStatusForEditor(pathname)
      .then((d) => {
        if (!active) return
        setStatus(d.status === 'draft' ? 'draft' : 'published')
        setVisibility(d.visibility_role ?? '')
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [pathname])

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await savePageStatus(pathname, { status, visibilityRole: visibility || null })
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  if (loading) {
    return <div className="h-36 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {(['published', 'draft'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            disabled={pending}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === s ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:text-text'
            }`}
          >
            {s === 'published' ? 'Published' : 'Draft'}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {status === 'draft'
          ? 'Hidden from everyone except staff. You can still open and preview it.'
          : 'Live for anyone who meets the visibility below.'}
      </p>
      <label className="block space-y-1">
        <span className={labelClasses}>Who can reach it</span>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          disabled={pending}
          className={fieldClasses}
        >
          <option value="">Anyone signed in</option>
          {VISIBILITY_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
