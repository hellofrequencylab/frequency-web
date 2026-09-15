'use client'

import { OPEN_COOKIE_CHOICES_EVENT } from './cookie-banner'

// The way back to the question (OWN-061). Consent that cannot be withdrawn is not consent, and a
// banner that only ever shows once gives no one a second chance at it. This re-opens the banner
// wherever the reader is, including outside the prior-consent region, where nobody was asked the
// first time but anyone may still want analytics off.
//
// A window event rather than shared state, matching the `open-chat` / `open-vera` convention in
// docs/CHAT-SHELL-PLAN.md §2: the banner already mounts in the root layout on every page, so the
// two need a doorbell, not a provider. Route-level, so it costs the shell bundle nothing.

export function CookieChoicesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_CHOICES_EVENT))}
      className="font-semibold text-primary-strong underline"
    >
      Change your cookie choice
    </button>
  )
}
