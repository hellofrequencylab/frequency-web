import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { clearPendingLaunch, readPendingLaunch } from '@/lib/launch/pending-io'
import { launchHomeHref } from '@/lib/launch/destination'
import { saveWizardResume, startLaunch } from '@/lib/launch/store'
import { readCarry } from '@/lib/launch/carry'
import { parseDraft } from '@/lib/create-space/builder'
import { markDraftConverted, readDraftByToken } from '@/lib/create-space/draft-io'
import { parseWizardResume } from '@/lib/launch/wizard-resume'

// /launch/claim (VLS-06): where a visitor lands after signing in with a launch held in their cookie. It makes their
// one space_launch row from the held niche and intents, clears the hold so it is claimed once, and sends them on
// to /launch. startLaunch hands back the launch already running, so a second tap, a second tab or a
// return visit never makes a second row. With no hold the route just resumes. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET() {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/claim')
  const held = await readPendingLaunch()
  if (held) {
    // The bounded resume pointer is authoritative when present; older holds used carry fields.
    const lead = held.resume?.leadToken ?? readCarry(held.answers.spotlight).lead ?? null
    const json = lead ? await readDraftByToken(lead) : null
    const recovered = json ? parseDraft(json, null) : null
    const draft = recovered && lead ? { ...recovered, leadToken: lead } : recovered
    const launch = await startLaunch(profileId, { niche: held.niche, intents: held.intents })
    if (launch) {
      const canonical = parseWizardResume(launch.resume)
      const incoming = held.resume
        ? parseWizardResume({ ...held.resume, leadToken: lead, draft })
        : draft ? parseWizardResume({
          version: 1, phase: 'launch', cursor: 4, theme: draft.kit, accentAt: draft.accentAt,
          niche: draft.niche, goals: draft.goals, timedEntry: false, draft, leadToken: lead,
        }) : null
      // A converted token no longer reads its draft. A complete, matching canonical copy
      // proves a previous claim succeeded without treating a token alone as durable content.
      const matchingCanonical = canonical?.draft && canonical.leadToken === lead
        ? parseWizardResume({ ...(held.resume ?? canonical), leadToken: lead, draft: draft ?? canonical.draft })
        : null
      let acknowledged = !!matchingCanonical && JSON.stringify(matchingCanonical) === JSON.stringify(canonical)
      const heldAt = Date.parse(held.savedAt)
      const savedAt = Date.parse(launch.updatedAt)
      const incomingIsNewer = Number.isFinite(heldAt) && Number.isFinite(savedAt) && heldAt > savedAt
      if (!acknowledged && !launch.spaceId && incoming && (!lead || draft) && (!canonical || incomingIsNewer)) {
        acknowledged = !!(await saveWizardResume(launch, incoming, new Date(), { heldSavedAt: held.savedAt }))
      }
      // Legacy tokenless answers need no draft transfer. Every token-backed hold must be
      // durably saved or an exact replay before reminders stop or its retry cookie clears.
      if (!held.resume && !lead) acknowledged = true
      if (acknowledged && lead) await markDraftConverted(lead)
      if (acknowledged && Object.keys(held.answers).length === 0) await clearPendingLaunch()
    }
  }
  redirect(launchHomeHref({ signedIn: true }))
}
