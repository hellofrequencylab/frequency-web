// THE LAUNCH SWITCHES (VLS-30). The Vera guided launch ships dark. Two on/off switches stage it, both read
// through envFlag (`1` / `true` / `on`, lib/env/string.ts), both listed blank in .env.example, and the
// activation gate for each lives in docs/RUNBOOKS.md ("Vera guided launch").
//
//   LAUNCH_SYSTEM_ENABLED  the launch itself: the box, the step screens, the reminder cron.
//   LAUNCH_ENTRY_ENABLED   the public doorway: every "Get a Free Spotlight" button. Needs the one above.
//
// With the first on and the second off, only a person who has the /launch/start link gets in: that is the
// staff-only stage. Pure env reads at call time, so a test can set the variable and call again.

import { envFlag } from '../env/string.ts'

/** The launch is on: the box, the step screens and the reminder cron may run. */
export function launchSystemEnabled(): boolean {
  return envFlag('LAUNCH_SYSTEM_ENABLED')
}

/** The public "Get a Free Spotlight" doorway is on. Never on while the launch itself is off. */
export function launchEntryEnabled(): boolean {
  return launchSystemEnabled() && envFlag('LAUNCH_ENTRY_ENABLED')
}
