// SEC-020: a follow-up that goes quiet raises an alarm.
//
// The drip crons ping their heartbeat whenever they RUN, so a pass that finds work due and delivers
// none of it looks identical to a pass that found nothing. That is the silence this module names.
// "Idle" (nothing due) is healthy and says nothing; "stalled" (work due, nothing delivered) is the
// failure, reported once per pass through the log line and Sentry so it can page.
import * as Sentry from '@sentry/nextjs'
import { log } from '@/lib/log'

type FollowUpState = 'idle' | 'ok' | 'stalled'

/** PURE. `due` = items owed this pass, `delivered` = items actually sent, completed or deliberately
 *  stopped. Due work with zero delivered is stalled; no due work is idle. */
function assessFollowUp(input: { due: number; delivered: number }): FollowUpState {
  if (input.due <= 0) return 'idle'
  return input.delivered > 0 ? 'ok' : 'stalled'
}

/** Log the state and, when stalled, capture it. Never throws: monitoring cannot take a cron down. */
export function reportFollowUp(job: string, input: { due: number; delivered: number }): FollowUpState {
  const state = assessFollowUp(input)
  try {
    if (state === 'stalled') {
      log.error(`cron.${job}.stalled`, { due: input.due, delivered: input.delivered })
      Sentry.captureMessage(`follow-up "${job}" had ${input.due} due and delivered none`, {
        level: 'error',
        tags: { route: `cron.${job}`, cron_job: job, follow_up: 'stalled' },
      })
    }
  } catch {
    // a monitoring failure must not change the cron's response
  }
  return state
}
