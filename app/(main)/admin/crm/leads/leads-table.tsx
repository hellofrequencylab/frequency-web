'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Download, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isError } from '@/lib/action-result'
import type { AbandonedSignupLead } from '@/lib/crm/signup-leads'
import { exportAbandonedSignupLeadsCsv } from './actions'

// The abandoned-leads roster (scan2 L9-03). Read-only rows with two ways to reach a person: a
// mailto link and a copy-address button. The CSV comes from the server action, not from these
// rows, so the download is authorised on the server and is not capped by the page's own limit.

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the mailto link beside it still works */
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${email}`}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

export function ExportLeadsButton({ sinceDays }: { sinceDays: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onExport() {
    setError(null)
    startTransition(async () => {
      const r = await exportAbandonedSignupLeadsCsv({ sinceDays })
      if (isError(r)) {
        setError(r.error)
        return
      }
      // Prepend a BOM so Excel opens UTF-8 cleanly.
      const blob = new Blob(['﻿' + r.data.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signup-leads-${sinceDays}d.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-body-sm text-danger">{error}</span>}
      <Button type="button" variant="secondary" size="sm" onClick={onExport} loading={isPending}>
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  )
}

export function LeadsTable({ leads }: { leads: AbandonedSignupLead[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-body-sm">
        <thead className="bg-surface-elevated text-left text-meta text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Person</th>
            <th scope="col" className="px-3 py-2 font-medium">Stopped at</th>
            <th scope="col" className="px-3 py-2 font-medium">What we know</th>
            <th scope="col" className="px-3 py-2 font-medium">Last seen</th>
            <th scope="col" className="px-3 py-2 font-medium">
              <span className="sr-only">Reach out</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-t border-border align-top">
              <td className="px-3 py-2">
                <div className="font-medium text-text">{l.name ?? l.email}</div>
                {l.name && <div className="text-meta text-muted">{l.email}</div>}
                {l.handle && <div className="text-meta text-subtle">@{l.handle}</div>}
              </td>
              <td className="px-3 py-2">
                <Badge tone={l.stepReached >= 3 ? 'success' : 'neutral'}>{l.stepLabel}</Badge>
              </td>
              <td className="max-w-xs px-3 py-2 text-muted">{l.summary || <span className="text-subtle">Nothing yet</span>}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">
                {l.ageDays === 0 ? 'Today' : l.ageDays === 1 ? 'Yesterday' : `${l.ageDays} days ago`}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <a href={`mailto:${l.email}`}>
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  </Button>
                  <CopyEmail email={l.email} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
