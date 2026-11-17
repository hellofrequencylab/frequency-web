// THE ONE LAUNCH DESTINATION. Nobody leaves the 12-minute flow until they have launched, so every way in (the
// "Get a Free Spotlight" buttons, /spaces/new, the Create a Space sign-in return, the launch box, the Space console
// nudge, the come-back email link) asks THIS file where to go and gets one answer: /launch, the page that shows
// what the account already has and what is next. PURE and client-safe.
//
// The one exception is a visitor with no account: /launch is the signed-in owner's page, so they go to the Create a
// Space wizard (LIVE-1969, ADR-1933), which needs no account and hands over to /launch/claim when they save. proxy.ts
// makes the same hop for a cold /launch and /launch/start before the member layout runs.

const LAUNCH_HOME = '/launch'
const WIZARD = '/create-a-space'
/** The marker a link INSIDE the flow carries, so the Spotlight step can tell "I was sent here by the launch page"
 *  from "I arrived at a step address cold" (which goes to /launch). */
const IN_FLOW_PARAM = 'go'
const LAUNCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where every entry to the launch lands. `lid` names one launch (the come-back email link); anything that is not
 *  a launch id is dropped, so the address cannot carry text. */
export function launchHomeHref(opts: { signedIn?: boolean; lid?: string | null } = {}): string {
  if (opts.signedIn === false) return WIZARD
  return opts.lid && LAUNCH_ID.test(opts.lid) ? `${LAUNCH_HOME}?lid=${opts.lid.toLowerCase()}` : LAUNCH_HOME
}

const LAUNCH_RESUME = '/launch/resume'

/** The come-back link (LIVE-2330): /launch/resume, carrying the launch id when it is one. Unlike the bare /launch,
 *  which proxy.ts hops to the Create a Space wizard for a visitor with no session, this route sends a signed-out
 *  owner through sign-in and back to their own launch. Anything that is not a launch id is dropped. */
export function launchResumeHref(lid?: string | null): string {
  return lid && LAUNCH_ID.test(lid) ? `${LAUNCH_RESUME}?lid=${lid.toLowerCase()}` : LAUNCH_RESUME
}

/** Where /launch/resume sends a signed-out request: sign-in, with `next` (the param app/sign-in/page.tsx reads through
 *  lib/auth/safe-next.ts) pointing back at the same resume link, so the owner lands on their launch afterwards. */
export function launchResumeSignInHref(lid?: string | null): string {
  return `/sign-in?next=${encodeURIComponent(launchResumeHref(lid))}`
}

/** A step address as the launch page links it: marked as in-flow so the step opens instead of bouncing back. */
export function inFlowHref(href: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}${IN_FLOW_PARAM}=1`
}

/** True when the Spotlight step should send this arrival to /launch: someone with a launch already started who
 *  opened the step address cold. A link from inside the flow, an error line or the new-Space choice stays. */
export function spotlightArrivalGoesHome(p: { hasLaunch: boolean; go?: string; e?: string; new?: string }): boolean {
  return p.hasLaunch && p.go !== '1' && !p.e && p.new !== '1'
}

/** The launch pages a visitor with NO account may open (owner 2026-11-13: a Free Spotlight click opens the Spotlight
 *  builder signed out, and the account is asked for at Publish). The member layout renders these in the public
 *  chrome instead of sending the visitor to the home page, which is what it did to every "Get a Free Spotlight"
 *  press and every "Keep building" link before LIVE-2324. Every other launch page stays the account's own. */
const ANON_LAUNCH_PAGES = new Set(['/launch/step/spotlight'])

/** Is this path a launch page a signed-out visitor may open? PURE. A trailing slash is the same page. */
export function isAnonLaunchPage(pathname: string | null): boolean {
  if (!pathname) return false
  return ANON_LAUNCH_PAGES.has(pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname)
}
