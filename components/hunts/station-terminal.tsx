'use client'

// The merchant station's terminal (FH-022). Staff enter the code a player shows, read what it is (issuer
// data only), then hand it over or cancel it. One idempotency key per code, kept across retries, so a
// dropped connection can be tapped again and a second terminal can not hand the same one over twice.
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'

type View = { grantId: string; rewardTitle: string; rewardKind: string; trailTitle: string; state: string; redeemable: boolean }

const STATE_WORDS: Record<string, string> = { granted: 'Ready to hand over', redeemed: 'Already used', revoked: 'Cancelled', expired: 'Expired' }

async function post(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch('/api/hunts/station', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

export function StationTerminal() {
  const [token, setToken] = useState('')
  const [view, setView] = useState<View | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())

  async function look() {
    setBusy(true)
    setMessage(null)
    setView(null)
    try {
      const { json } = await post({ action: 'preview', token: token.trim() })
      if (json.ok === true) {
        setView(json.view as View)
        setKey(crypto.randomUUID())
      } else {
        setMessage(json.reason === 'expired' ? 'That code has expired. Ask the player for a new one.' : 'We could not find that reward.')
      }
    } catch {
      setMessage('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function act(action: 'redeem' | 'void') {
    setBusy(true)
    try {
      const { json } = await post({ action, token: token.trim(), idempotencyKey: key, reason: action === 'void' ? reason : undefined })
      setMessage(typeof json.message === 'string' ? json.message : 'We could not find that reward.')
      if (json.ok === true) setView((v) => (v ? { ...v, state: action === 'redeem' ? 'redeemed' : 'revoked', redeemable: false } : v))
    } catch {
      setMessage('Something went wrong. Tap again to retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Redemption station" className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void look()
        }}
      >
        <label className={labelClasses} htmlFor="station-token">Code from the player</label>
        <Input id="station-token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
        <Button type="submit" disabled={busy || token.trim().length < 10}>Look it up</Button>
      </form>

      {view && (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-body font-semibold">{view.rewardTitle}</h2>
            <Badge tone={view.state === 'granted' ? 'success' : 'warning'}>{STATE_WORDS[view.state] ?? view.state}</Badge>
          </div>
          <p className="text-body-sm text-muted">From {view.trailTitle}</p>
          {view.redeemable && (
            <div className="space-y-3">
              <Button type="button" disabled={busy} onClick={() => void act('redeem')}>Hand it over</Button>
              <div className="space-y-2">
                <label className={labelClasses} htmlFor="station-reason">Cancel this one instead? Say why.</label>
                <Input id="station-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button type="button" variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void act('void')}>Cancel it</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && <p role="status" className="rounded-card border border-border bg-surface p-4 text-body-sm">{message}</p>}
    </section>
  )
}
