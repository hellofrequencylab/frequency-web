'use client'

import { useEffect, useRef, useState } from 'react'
import { BOT_CHECK_FIELD, botCheckSiteKey } from '@/lib/auth/bot-check'

// THE INVISIBLE BOT CHECK (SEC-047, owner ruling 2026-11-26: "Yes, invisible check"). Cloudflare
// Turnstile runs a check in the background and hands back a one-use token. The token rides the form
// as BOT_CHECK_FIELD, and the sign-in action passes it to Supabase as `captchaToken`. With Supabase's
// captcha switched on, a sign-in, sign-up or reset without a fresh token is refused at the auth server,
// so a script hitting Supabase directly with the public key gets nowhere.
//
// OFF until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: nothing loads, nothing renders, the field stays out of
// the form. Order of switching on: docs/RUNBOOKS.md, "Invisible bot check".
//
// Two ways to use it:
//   · inside a <form>: <BotCheck /> adds the hidden field itself;
//   · a caller that builds its own FormData: <BotCheck onToken={setToken} /> and fd.set(BOT_CHECK_FIELD, token).

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile failed to load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function BotCheck({ onToken }: { onToken?: (token: string) => void }) {
  const siteKey = botCheckSiteKey()
  const box = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState('')
  const report = useRef(onToken)
  useEffect(() => {
    report.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!siteKey || !box.current) return
    let id: string | null = null
    let gone = false
    const set = (t: string) => {
      setToken(t)
      report.current?.(t)
    }
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return
        id = ts.render(box.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          // A token lasts five minutes and works once; refresh it rather than send a dead one.
          'refresh-expired': 'auto',
          callback: set,
          'expired-callback': () => set(''),
          'error-callback': () => set(''),
        })
      })
      .catch(() => {
        // Swallowed: the action answers a missing token with the `bot` line, which asks for a retry.
      })
    return () => {
      gone = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [siteKey])

  if (!siteKey) return null
  return (
    <>
      <div ref={box} className="fqa-bot" />
      {!onToken && <input type="hidden" name={BOT_CHECK_FIELD} value={token} />}
    </>
  )
}
