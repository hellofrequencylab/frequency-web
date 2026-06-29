'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownNarrowWide } from 'lucide-react'

const OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'last_contacted', label: 'Last contacted' },
  { value: 'follow_up', label: 'Follow-up due' },
  { value: 'name', label: 'Name' },
] as const

export type ContactSortValue = (typeof OPTIONS)[number]['value']

/** The sort control for My Contacts. Drives `?sort=` while keeping the current
 *  tab + search; the server reads it and orders the list. */
export function ContactSort({ value }: { value: ContactSortValue }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString())
    if (next === 'recent') sp.delete('sort')
    else sp.set('sort', next)
    const qs = sp.toString()
    router.push(`/network/contacts${qs ? `?${qs}` : ''}`)
  }

  return (
    <label className="flex items-center gap-1.5 pb-2 text-sm text-muted">
      <ArrowDownNarrowWide className="h-3.5 w-3.5 text-subtle" aria-hidden />
      <span className="sr-only">Sort contacts</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border-strong bg-surface py-1.5 pl-2 pr-7 text-sm text-text focus:border-border-strong focus:outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
