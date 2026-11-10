'use client'

import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/field'
import { k } from './skin'

// ASK FOR A TOKEN (PROG-E10, ADR-976 D-1). Sites take no CSS, so a look the theme lacks is requested here in
// words and the team adds a token for it. The shell draws this only when the server says the path is open
// (SITE_TOKEN_REQUESTS_ENABLED); the action re-checks, so a stale page cannot send one while it is off.

export type TokenRequestSend = (requests: { token: string; want: string; why: string }[]) => Promise<{ ok: true; ref: number } | { ok: false; error: string }>

export function TokenRequestPanel({ onSend }: { onSend: TokenRequestSend }) {
  const [token, setToken] = useState('')
  const [want, setWant] = useState('')
  const [why, setWhy] = useState('')
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'sent'; ref: number } | { kind: 'error'; message: string }>({ kind: 'idle' })
  async function send() {
    setState({ kind: 'busy' })
    try {
      const r = await onSend([{ token, want, why }])
      if (r.ok) {
        setState({ kind: 'sent', ref: r.ref })
        setToken(''); setWant(''); setWhy('')
      } else setState({ kind: 'error', message: r.error })
    } catch {
      setState({ kind: 'error', message: 'Could not send the request. Try again in a moment.' })
    }
  }
  return (
    <>
      <div className={k('we-caption')}>Need a look the theme does not have?</div>
      <div className={k('we-note')}>Describe it in words. The team adds a token for it; sites do not take CSS.</div>
      <label className={k('we-field')}>What to call it<Input variant="seamless" type="text" value={token} maxLength={80} onChange={(e) => setToken(e.target.value)} placeholder="A softer accent for badges" /></label>
      <label className={k('we-field')}>What it should do<Textarea variant="seamless" value={want} maxLength={600} rows={3} onChange={(e) => setWant(e.target.value)} /></label>
      <label className={k('we-field')}>Why the theme does not cover it (optional)<Textarea variant="seamless" value={why} maxLength={600} rows={2} onChange={(e) => setWhy(e.target.value)} /></label>
      <div className={k('we-actions')}>
        <button type="button" className={k('we-action secondary')} disabled={state.kind === 'busy' || !token.trim() || !want.trim()} onClick={send}>{state.kind === 'busy' ? 'Sending…' : 'Send request'}</button>
      </div>
      {state.kind === 'sent' && <p role="status" className={k('we-note')}>Sent. The team will follow up on ticket #{state.ref}.</p>}
      {state.kind === 'error' && <p role="alert" className={k('we-note')}>{state.message}</p>}
    </>
  )
}
