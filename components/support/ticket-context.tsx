import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { contextLines } from '@/lib/support/context'
import type { SupportContext } from '@/lib/support/types'

// The captured page/activity context + the screenshot, for either detail surface.
export function TicketContext({
  context,
  pageUrl,
  screenshotUrl,
}: {
  context: SupportContext
  pageUrl: string | null
  screenshotUrl: string | null
}) {
  const lines = contextLines(context)
  if (lines.length === 0 && !screenshotUrl && !pageUrl) return null

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Captured context</p>

      {pageUrl && (
        <Link href={pageUrl} className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-primary-strong hover:underline">
          <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{pageUrl}</span>
        </Link>
      )}

      {lines.length > 0 && (
        <dl className="space-y-1 text-2xs">
          {lines.map((l) => (
            <div key={l.label} className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold text-subtle">{l.label}</dt>
              <dd className="min-w-0 flex-1 break-words text-muted">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {screenshotUrl && (
        <a href={screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshotUrl} alt="Reported screenshot" className="max-h-80 w-full object-contain bg-surface-elevated" />
        </a>
      )}
    </div>
  )
}
