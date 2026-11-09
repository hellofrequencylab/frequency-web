// THE CREATE A SPACE SWITCH (LIVE-1968). The draft reminder emails ship dark. One on/off switch, read through envFlag
// (`1` / `true` / `on`, lib/env/string.ts), listed blank in .env.example, with its activation gate in docs/RUNBOOKS.md
// ("Create a Space draft reminders"). The page itself, the save and the resume link need no switch: they only keep a
// draft the visitor asked to keep. Pure env read at call time, so a test can set the variable and call again.

import { envFlag } from '../env/string.ts'

/** The reminder cron may send. Off: the cron logs a skipped run and sends nothing. */
export function draftRemindersEnabled(): boolean {
  return envFlag('CREATE_SPACE_DRAFT_REMINDERS_ENABLED')
}
