'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  CONSENT_REGION_COOKIE,
  cookiesToClearOnWithdrawal,
  parseConsentChoice,
  shouldAskForConsent,
  type ConsentChoice,
} from '@/lib/consent/cookie-consent'

// The cookie consent banner (OWN-061, ADR-1370). The ASKING half; lib/consent/cookie-consent.ts is
// the law, proxy.ts and the GA head script are the two writers that obey it.
//
// ── WHY IT ASKS SOME PEOPLE AND NOT OTHERS ──────────────────────────────────────────────────────
// It renders only where prior consent is the law (the edge tells the browser so through `fq_ask`)
// and only until a choice exists. Everywhere else the analytics default is unchanged and there is
// nothing to ask, so the banner is not shown and costs those visitors one `document.cookie` read.
// A visitor who wants to revisit the question dispatches `open-cookie-choices` — the window-event
// convention the chat shell already uses — which the privacy policy's control does.
//
// ── EQUAL PROMINENCE IS WHY BOTH BUTTONS LOOK THE SAME ──────────────────────────────────────────
// Accept and Decline are the same variant, the same size and the same one click. Consent that is
// only valid when freely given cannot be nudged by making the refusal quieter, and the cheapest way
// to be beyond argument about that is to not style a preference at all.
//
// ── THE TWO THINGS "ACCEPT" ACTUALLY DOES ────────────────────────────────────────────────────────
//   1. `window.__fqGa()` — the SAME loader the head script defined, so GA starts in this pageview
//      rather than at the next hard load. There is exactly one copy of the GA loading rules and it
//      lives in the law module; this calls it, it does not repeat it.
//   2. `router.refresh()` — the first-touch cookie is written by the EDGE, so the only way to get
//      it after a late yes is to make another request through the proxy. The refresh carries the
//      current URL, campaign parameters and all, so a consenting visitor's attribution is captured
//      rather than lost.
// "Decline" is the mirror: GA's own kill switch for a tag that may already be running, and the
// attribution and `_ga*` cookies cleared, so withdrawing the permission takes the storage with it.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/** The window-event name a "change your cookie choice" control dispatches. */
export const OPEN_COOKIE_CHOICES_EVENT = 'open-cookie-choices'

declare global {
  interface Window {
    /** Defined by the GA head script (lib/consent/cookie-consent.ts). Idempotent. */
    __fqGa?: () => void
  }
}

function readCookie(name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie)
  return match ? match[1] : null
}

function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
}

export function CookieBanner() {
  const [asking, setAsking] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const ask = () => {
      try {
        setAsking(
          shouldAskForConsent({
            choice: parseConsentChoice(readCookie(CONSENT_COOKIE)),
            priorConsentRegion: readCookie(CONSENT_REGION_COOKIE) === '1',
          }),
        )
      } catch {
        // A browser that refuses document.cookie entirely stores nothing either, so there is
        // nothing to consent to. Staying silent is the correct outcome, not a swallowed failure.
      }
    }
    ask()
    // Re-opening is always allowed, even where the law does not require asking: someone who wants
    // to turn analytics off should be able to, wherever they are.
    const reopen = () => setAsking(true)
    window.addEventListener(OPEN_COOKIE_CHOICES_EVENT, reopen)
    return () => window.removeEventListener(OPEN_COOKIE_CHOICES_EVENT, reopen)
  }, [])

  const answer = useCallback(
    (choice: ConsentChoice) => {
      setAsking(false)
      try {
        writeCookie(CONSENT_COOKIE, choice, CONSENT_MAX_AGE)
      } catch {
        return
      }
      if (choice === 'granted') {
        window.__fqGa?.()
        router.refresh()
        return
      }
      if (GA_ID) {
        ;(window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true
      }
      for (const name of cookiesToClearOnWithdrawal(document.cookie)) clearCookie(name)
    },
    [router],
  )

  if (!asking) return null

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-[calc(var(--tab-bar-clearance)+0.75rem)] z-[70] mx-auto max-w-md rounded-card border border-border bg-surface-elevated p-4 shadow-pop md:bottom-4 md:left-4 md:right-auto md:mx-0 print:hidden"
    >
      <p className="text-body-sm text-text">
        We use a few cookies to keep you signed in. We would also like Google Analytics and one
        attribution cookie, so we can see which pages bring people here. That second part is your
        call.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => answer('granted')}>
          Accept
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => answer('denied')}>
          Decline
        </Button>
        <Link href="/privacy" className="ml-auto text-meta text-muted underline hover:text-text">
          Privacy policy
        </Link>
      </div>
    </div>
  )
}
