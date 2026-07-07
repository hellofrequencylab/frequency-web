// The Be Still "always offer a Begin" fallback (ADR-566 regression fix). Pure helpers, split out
// of components/on-air/session.tsx so they are unit-testable in a node env without the client
// component's runtime imports (next/navigation, Web Audio, wake lock). The type import is
// erased at runtime, so this stays a plain, side-effect-free module.

import type { SessionMode } from '@/lib/on-air'
import type { OnAirPractice } from '@/components/on-air/session'

/** The Free Practice fallback in a loaded practice list: the open-length sit the loader always
 *  appends. It is the only entry that maps to ANOTHER log via `logsAs` and still routes to a timer
 *  (timer_kind !== 'none'), so it is unambiguous without importing the id constant. Returns
 *  undefined when the list has no Free Practice (e.g. the default sit practice is missing). */
export function findFreeSit(practices: OnAirPractice[]): OnAirPractice | undefined {
  return practices.find((p) => !!p.logsAs && p.timerKind !== 'none')
}

/** Whether a Be Still Begin should run the Free Practice fallback rather than the resolved practice.
 *  True only when the member has picked a TIMED mode (not Just Log), the resolved practice is
 *  log-only (cannot time), and a Free Practice fallback exists to run. This is what guarantees the
 *  Be Still side always offers a Begin (regression fix: a log-only default no longer dead-ends on
 *  Just Log). */
export function shouldRunFreeSit(
  mode: SessionMode,
  practiceCanTime: boolean,
  freeSit: OnAirPractice | undefined,
): boolean {
  return mode !== 'log' && !practiceCanTime && !!freeSit
}
