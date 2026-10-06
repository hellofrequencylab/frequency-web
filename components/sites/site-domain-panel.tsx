'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import type { DomainStatus } from '@/lib/sites/vercel-domains'
import {
  connectSiteDomain,
  checkSiteDomain,
  removeSiteDomain,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE DOMAIN SECTION (PROG-E10, LIVE-743). Where a Space owner puts their website on their own domain:
// type the domain, press Connect, then copy the DNS records shown here into their registrar's DNS
// settings and press Check again until both checks pass. Every write re-gates in its server action;
// this client is feedback only. DAWN semantic tokens only, sentence-case copy, no em dashes.

type Status = DomainStatus & { domain: string }

export function SiteDomainPanel({
  slug,
  initial,
  websitePublished,
}: {
  slug: string
  /** The bound domain and its status, read on the server, or null when none is connected. */
  initial: Status | null
  websitePublished: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(initial)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function connect() {
    setError(null)
    start(async () => {
      const result = await connectSiteDomain(slug, input)
      if (isError(result)) return setError(result.error)
      setStatus(result.data)
      setInput('')
      router.refresh()
    })
  }

  function check() {
    setError(null)
    start(async () => {
      const result = await checkSiteDomain(slug)
      if (isError(result)) return setError(result.error)
      setStatus(result.data)
    })
  }

  function remove() {
    setError(null)
    start(async () => {
      const result = await removeSiteDomain(slug)
      if (isError(result)) return setError(result.error)
      setStatus(null)
      router.refresh()
    })
  }

  const live = status ? status.attached && status.verified && status.dnsReady : false

  return (
    <section>
      <SectionHeader title="Your domain" />
      {error && (
        <p className="mb-3 rounded-card border border-danger bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger">
          {error}
        </p>
      )}

      {!status ? (
        <>
          <p className="-mt-2 mb-3 text-body-sm text-muted">
            Put your website on a domain you own, like yourname.com. Enter it here, then you will get the
            records to add where you bought the domain.
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              connect()
            }}
          >
            <Input
              aria-label="Your domain"
              placeholder="yourname.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="max-w-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="primary" size="sm" disabled={pending || input.trim().length === 0}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
              Connect
            </Button>
          </form>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{status.domain}</span>
            {live ? (
              <Badge tone="success">Live</Badge>
            ) : (
              <Badge tone="warning">Waiting on DNS</Badge>
            )}
          </div>

          <ul className="space-y-1 text-body-sm">
            <StatusLine done={status.attached} label="Connected to Frequency hosting" />
            <StatusLine done={status.verified} label="Ownership confirmed" />
            <StatusLine done={status.dnsReady} label="DNS points to your website" />
          </ul>

          {status.problem && <p className="text-body-sm text-warning">{status.problem}</p>}

          {!live && (
            <div className="space-y-3">
              <p className="text-body-sm text-muted">
                Sign in where you bought {status.domain} (your registrar, like GoDaddy, Namecheap,
                Squarespace or Cloudflare), open its DNS settings, and add these records. If there is
                already an A record for @ or a record for www, edit it to match instead of adding a second
                one. Changes usually show up within an hour, and can take up to 48.
              </p>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-elevated text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.records.map((r) => (
                      <tr key={`${r.type}-${r.name}`} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono">{r.type}</td>
                        <td className="px-3 py-2 font-mono">{r.name}</td>
                        <td className="px-3 py-2">
                          <span className="break-all font-mono">{r.value}</span>
                          <span className="mt-0.5 block text-muted">{r.purpose}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {live && !websitePublished && (
            <p className="text-body-sm text-muted">
              Your domain is ready. Press Publish website above so visitors see your pages there.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {live ? (
              <a
                href={`https://${status.domain}`}
                target="_blank"
                rel="noopener"
                className="text-body-sm font-semibold text-primary-strong hover:underline"
              >
                Open {status.domain}
              </a>
            ) : (
              <Button type="button" variant="primary" size="sm" disabled={pending} onClick={check}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                Check again
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={remove}>
              Remove domain
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={done ? 'text-success' : 'text-muted'}>
      {done ? 'Done: ' : 'Not yet: '}
      {label}
    </li>
  )
}
