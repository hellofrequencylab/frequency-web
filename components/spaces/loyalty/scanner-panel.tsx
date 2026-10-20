'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, CreditCard, Nfc, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'
import { registerScanner, revokeCard, revokeScanner } from '@/lib/devices/actions'
import type { MemberCardSummary, ScannerDeviceSummary } from '@/lib/devices/store'

// COUNTER SCANNERS, the owner panel (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Register a scanner
// (its key is shown once, here, and never again), revoke one, and revoke a member card the scanners
// issued. Every write is an owner-gated action in lib/devices/actions.ts. No em dashes.

export function ScannerPanel({
  spaceId,
  devices,
  cards,
}: {
  spaceId: string
  devices: ScannerDeviceSummary[]
  cards: MemberCardSummary[]
}) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<{ label: string; deviceId: string; secret: string; header: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function register() {
    setMessage(null)
    start(async () => {
      const result = await registerScanner(spaceId, label)
      if (isError(result)) {
        setMessage(result.error)
        return
      }
      setFresh({ label: label.trim(), ...result.data })
      setCopied(false)
      setLabel('')
      router.refresh()
    })
  }

  function revoke(kind: 'device' | 'card', id: string) {
    setMessage(null)
    start(async () => {
      const result = kind === 'device' ? await revokeScanner(spaceId, id) : await revokeCard(spaceId, id)
      if (isError(result)) setMessage(result.error)
      else router.refresh()
    })
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const live = devices.filter((d) => d.active)
  const liveCards = cards.filter((c) => c.active)

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending && label.trim()) register()
        }}
      >
        <div className="flex-1">
          <Label htmlFor="scanner-label">Scanner name</Label>
          <Input
            id="scanner-label"
            value={label}
            maxLength={60}
            placeholder="Front counter"
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !label.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> Add scanner
        </Button>
      </form>

      {fresh && (
        <div role="status" className="space-y-2 rounded-card border border-primary bg-primary-bg p-4">
          <p className="text-body-sm font-semibold text-text">{fresh.label} is ready. Copy its key now.</p>
          <p className="text-meta text-muted">
            Paste it into the scanner&apos;s Settings as Device ID and Secret, or as one line. This is the only time it shows; lose
            it and you revoke the scanner and add a new one.
          </p>
          <code className="block break-all rounded-control bg-surface px-3 py-2 font-mono text-meta text-text">{fresh.header}</code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => copy(fresh.header)}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy key'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFresh(null)}>
              I saved it
            </Button>
          </div>
          <p className="text-meta text-muted">
            Device ID <span className="font-mono">{fresh.deviceId}</span>
          </p>
        </div>
      )}

      {message && <p role="alert" className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger">{message}</p>}

      {devices.length === 0 ? (
        <EmptyState
          icon={Nfc}
          title="No scanners yet."
          description="Add one to check members in by tapping their card at the counter. Every tap stamps their card like the door code does."
        />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-semibold text-text">{d.label}</p>
                <p className="text-meta text-muted">
                  {d.active ? (d.lastSeenAt ? `Last seen ${relativeTime(d.lastSeenAt)}` : 'Not seen yet') : 'Revoked'}
                </p>
              </div>
              {d.active && (
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => revoke('device', d.id)}>
                  <X className="h-4 w-4" aria-hidden /> Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <p className="text-body-sm font-semibold text-text">
          Member cards <span className="font-normal text-muted">· {liveCards.length} live</span>
        </p>
        {cards.length === 0 ? (
          <p className="text-body-sm text-muted">
            {live.length === 0 ? 'Cards are written by a scanner.' : 'Write a card from the scanner with the member’s handle.'}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CreditCard className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-text">
                      {c.memberName}
                      {c.memberHandle ? <span className="font-normal text-muted"> @{c.memberHandle}</span> : null}
                    </p>
                    <p className="text-meta text-muted">
                      {c.active ? (c.lastUsedAt ? `Last tapped ${relativeTime(c.lastUsedAt)}` : 'Not tapped yet') : 'Revoked'}
                      {c.issuedByLabel ? ` · from ${c.issuedByLabel}` : ''}
                    </p>
                  </div>
                </div>
                {c.active && (
                  <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => revoke('card', c.id)}>
                    <X className="h-4 w-4" aria-hidden /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
