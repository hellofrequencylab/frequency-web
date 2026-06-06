import type { SupportContext } from './types'

// Gather page + activity data at report time (client-only). Best-effort — any field
// that isn't available is simply omitted, never blocking a report. Privacy: this is
// non-sensitive environment data (route, viewport, UA); the screenshot is the part
// that may carry on-screen data, and it's opt-in + stored privately.
export function gatherSupportContext(): SupportContext {
  if (typeof window === 'undefined') return {}
  const nav = window.navigator
  return {
    url: window.location.href,
    pathname: window.location.pathname,
    referrer: document.referrer || undefined,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    userAgent: nav.userAgent,
    language: nav.language,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    capturedAt: new Date().toISOString(),
  }
}

/** A compact, human-readable rendering of the captured context (for the dialog
 *  preview + the ticket detail panels). */
export function contextLines(ctx: SupportContext): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (ctx.pathname) out.push({ label: 'Page', value: ctx.pathname })
  if (ctx.viewport) out.push({ label: 'Screen', value: `${ctx.viewport.w}×${ctx.viewport.h}` })
  if (ctx.referrer) out.push({ label: 'Came from', value: ctx.referrer })
  if (ctx.language) out.push({ label: 'Language', value: ctx.language })
  if (ctx.appVersion) out.push({ label: 'Version', value: ctx.appVersion })
  if (ctx.userAgent) out.push({ label: 'Browser', value: ctx.userAgent })
  if (ctx.capturedAt) out.push({ label: 'Captured', value: new Date(ctx.capturedAt).toLocaleString() })
  return out
}
