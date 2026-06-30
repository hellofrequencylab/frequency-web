'use server'

// Keystone founder-bootstrap action (Growth OS Engine 8, GE8-4 / GE8-6). Records that
// a would-be founder TAPPED one of the founder-bootstrap prompt's actions (seed a
// circle / host an event / invite people), so the global-to-local funnel can read how
// many cold-corner prompts convert into a seeding intent.
//
// SELF-AUTHORIZED: the actor is always resolved from the session (getCallerProfile), so
// a caller can only ever record their OWN tap. Best-effort + fail-safe: it never throws,
// and it does not block the navigation the button is about to do. The locality is read
// fresh server-side (the client is never trusted to report its own city bucket).

import { getCallerProfile } from '@/lib/auth'
import { getLocalitySeedSignal } from '@/lib/keystone/store'
import { trackFounderPromptActed, type FounderAction } from '@/lib/keystone/instrumentation'

const ACTIONS: readonly FounderAction[] = ['circle', 'event', 'invite']

export async function recordFounderTap(action: FounderAction): Promise<void> {
  if (!ACTIONS.includes(action)) return
  try {
    const profile = await getCallerProfile()
    if (!profile) return
    const { cityKey, signal } = await getLocalitySeedSignal(profile.id)
    trackFounderPromptActed(profile.id, action, { cityKey, readiness: signal.readiness })
  } catch {
    // Instrumentation is never allowed to break the member's tap.
  }
}
