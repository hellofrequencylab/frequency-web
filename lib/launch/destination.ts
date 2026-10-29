// THE ONE LAUNCH DESTINATION. Nobody leaves the 12-minute flow until they have launched, so every way in (the
// "Get a Free Spotlight" buttons, /spaces/new, the Create a Space sign-in return, the launch box, the Space console
// nudge, the come-back email link) asks THIS file where to go and gets one answer: /launch, the page that shows
// what the account already has and what is next. PURE and client-safe.
//
// The one exception is a visitor with no account: /launch is the signed-in owner's page, so they go to the
// Spotlight form, which holds what they type in the launch cookie (lib/launch/pending.ts) until they sign in.

import { launchStepHref } from './steps.ts'

const LAUNCH_HOME = '/launch'
const SPOTLIGHT_FORM = launchStepHref('spotlight')
/** The marker a link INSIDE the flow carries, so the Spotlight step can tell "I was sent here by the launch page"
 *  from "I arrived at a step address cold" (which goes to /launch). */
const IN_FLOW_PARAM = 'go'
const LAUNCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where every entry to the launch lands. `lid` names one launch (the come-back email link); anything that is not
 *  a launch id is dropped, so the address cannot carry text. */
export function launchHomeHref(opts: { signedIn?: boolean; lid?: string | null } = {}): string {
  if (opts.signedIn === false) return SPOTLIGHT_FORM
  return opts.lid && LAUNCH_ID.test(opts.lid) ? `${LAUNCH_HOME}?lid=${opts.lid.toLowerCase()}` : LAUNCH_HOME
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
