// WHERE A RETURNING PERSON LANDS (VLS-10). PURE: given one launch row and the clock, say what the resume page
// and the /launch/resume link should do. The step to pick up is lib/launch/state.ts resumeStep (the first
// step, in their own order, that is neither published nor skipped); this file only adds the three other
// outcomes (stopped, finished, nothing to find) and the words the welcome-back page uses.

import { launchPhase, resumeStep, type LaunchSnapshot } from './state.ts'
import { launchStep, launchStepHref, LAUNCH_STEP_IDS, type LaunchStepId } from './steps.ts'

type ResumeView =
  | { kind: 'step'; step: LaunchStepId; label: string; href: string; savedAgo: string; made: string[] }
  | { kind: 'restart' }
  | { kind: 'complete' }

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". Total: junk or a future time reads as just now. */
export function agoLabel(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** What a launch row means for someone coming back to it. A stopped launch offers a restart; a finished one
 *  (or one with every step settled) says so; a running one names the step to pick up and what is already made. */
export function resumeView(l: LaunchSnapshot, now: Date): ResumeView {
  const phase = launchPhase(l, now)
  if (phase === 'cancelled') return { kind: 'restart' }
  if (phase === 'completed') return { kind: 'complete' }
  const step = resumeStep(l.niche, l.intents, l.steps)
  if (!step) return { kind: 'complete' }
  const made = LAUNCH_STEP_IDS.filter((id) => l.steps[id]?.status === 'published').map((id) => launchStep(id).label)
  return { kind: 'step', step, label: launchStep(step).label, href: launchStepHref(step), savedAgo: agoLabel(l.updatedAt, now), made }
}
