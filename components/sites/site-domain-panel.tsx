'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Globe, Loader2, RefreshCw } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import type { DomainStatus } from '@/lib/sites/vercel-domains'
import { DOMAIN_METHODS } from '@/lib/sites/domain-methods'
import {
  connectSiteDomain,
  checkSiteDomain,
  removeSiteDomain,
  domainConnectLink,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE DOMAIN SECTION (PROG-E10, LIVE-743, LIVE-780). Where a Space owner puts their website on their
// own domain: pick how (DOMAIN_METHODS: own domain via DNS and connect automatically are live; buy a
// domain shows as coming), type the domain, press Connect. When the domain's DNS provider has
// onboarded Frequency's Domain Connect template, a "Connect with <provider>" button sets the records
// in one approval; otherwise (or as well) the owner copies the records shown here into the DNS
// provider the panel names. While DNS is pending the panel re-checks on its own, so the owner never
// has to guess. Every write re-gates in its server action; this client is feedback only. DAWN semantic
// tokens only, sentence-case copy, no em dashes.

/** Re-check every 30 seconds while waiting on DNS, for up to 20 minutes per page visit. */
const AUTO_CHECK_MS = 30_000
const AUTO_CHECK_MAX = 40

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

  // Quiet auto re-check while waiting on DNS (no error banner on a failed poll; Check again still shows one).
  const polls = useRef(0)
  const waiting = status !== null && !live
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(async () => {
      if (document.visibilityState !== 'visible' || polls.current >= AUTO_CHECK_MAX) return
      polls.current += 1
      const result = await checkSiteDomain(slug)
      if (!isError(result)) setStatus(result.data)
    }, AUTO_CHECK_MS)
    return () => window.clearInterval(id)
  }, [waiting, slug])

  // Connect automatically: ask once per pending domain whether its DNS provider can apply Frequency's
  // template. Any failure just leaves the copy steps, which are always shown.
  const [oneClick, setOneClick] = useState<{ domain: string; providerName: string; applyUrl: string } | null>(null)
  const oneClickFor = status && !live && !status.providerIsVercel ? status.domain : null
  useEffect(() => {
    if (!oneClickFor) return
    let cancelled = false
    domainConnectLink(slug)
      .then((result) => {
        if (cancelled || isError(result) || !result.data.supported) return
        setOneClick({ domain: oneClickFor, providerName: result.data.providerName, applyUrl: result.data.applyUrl })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [oneClickFor, slug])
  const connectLink = oneClick && oneClick.domain === oneClickFor ? oneClick : null

  const where = status?.provider ?? 'the company that manages your domain'

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
          <p className="-mt-2 mb-3 text-body-sm text-muted">Put your website on your own domain, like yourname.com.</p>
          <ul className="mb-4 grid gap-2 sm:grid-cols-3">
            {DOMAIN_METHODS.map((m) => (
              <li
                key={m.key}
                className={
                  m.available
                    ? 'rounded-card border border-primary bg-primary-bg px-3 py-2'
                    : 'rounded-card border border-border px-3 py-2 opacity-70'
                }
                aria-disabled={!m.available || undefined}
              >
                <p className="flex items-center gap-2 text-body-sm font-semibold text-text">
                  {m.label}
                  {!m.available && (
                    <Badge tone="neutral" size="sm">
                      Coming soon
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-body-sm text-muted">{m.description}</p>
              </li>
            ))}
          </ul>
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
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Globe className="h-4 w-4" aria-hidden />
              )}
              Connect
            </Button>
          </form>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{status.domain}</span>
            {live ? <Badge tone="success">Live</Badge> : <Badge tone="warning">Waiting on DNS</Badge>}
          </div>

          <ul className="space-y-1 text-body-sm">
            <StatusLine done={status.attached} label="Connected to Frequency hosting" />
            <StatusLine done={status.verified} label="Ownership confirmed" />
            <StatusLine done={status.dnsReady} label="DNS points to your website" />
          </ul>

          {status.problem && <p className="text-body-sm text-warning">{status.problem}</p>}

          {!live && (
            <div className="space-y-3">
              {connectLink && (
                <div className="space-y-2 rounded-card border border-primary bg-primary-bg px-3 py-3">
                  <p className="text-body-sm text-text">
                    {connectLink.providerName} can set these records for you. Sign in there, approve, and you come
                    straight back here.
                  </p>
                  <a href={connectLink.applyUrl} rel="noopener" className={buttonClasses('primary', 'sm')}>
                    <Globe className="h-4 w-4" aria-hidden />
                    Connect with {connectLink.providerName}
                  </a>
                  <p className="text-body-sm text-muted">Or add the records yourself:</p>
                </div>
              )}
              {status.providerIsVercel ? (
                <p className="text-body-sm text-muted">
                  Your domain&apos;s DNS is already managed by our hosting, so there is nothing to add. This page checks
                  again on its own.
                </p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-body-sm text-muted">
                  <li>
                    Sign in to <span className="font-semibold text-text">{where}</span>
                    {status.provider ? ", where your domain's DNS is managed," : ''} and open the DNS settings for{' '}
                    {status.domain}.
                  </li>
                  <li>
                    Add each record below. If a record with the same type and name is already there, edit it to match
                    instead of adding a second one.
                  </li>
                  <li>Save. This page checks again every 30 seconds, and it usually goes live within an hour.</li>
                </ol>
              )}
              {!status.providerIsVercel && (
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
                          <td className="px-3 py-2">
                            <CopyValue value={r.name} label={`${r.type} record name`} />
                          </td>
                          <td className="px-3 py-2">
                            <CopyValue value={r.value} label={`${r.type} record value`} />
                            <span className="mt-0.5 block text-muted">{r.purpose}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
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

/** A DNS value with a copy button, so nobody retypes a long value by hand. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className="break-all font-mono">{value}</span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-control p-1 text-muted transition-colors hover:text-text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard blocked: the value stays selectable on screen.
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </span>
  )
}
