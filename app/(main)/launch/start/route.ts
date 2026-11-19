import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { recordLaunchEvent } from '@/lib/launch/events'
import { readPendingLaunch, writePendingLaunch } from '@/lib/launch/pending-io'
import { inFlowHref, launchHomeHref } from '@/lib/launch/destination'
import { getActiveLaunch, saveWizardResume, startLaunch } from '@/lib/launch/store'
import { cookies } from 'next/headers'
import { isPreviewKit, kitAccentIndex } from '@/lib/create-space/preview-site'
import { lastKitFrom } from '@/lib/create-space/last-kit'
import { COLD_KIT } from '@/lib/create-space/door'
import { resolveOnboardingNicheSeed } from '@/lib/create-space/niche-choices.server'
import { parseWizardResume } from '@/lib/launch/wizard-resume'
import { ownedWizardEntry } from '@/lib/launch/entry-io'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { resolvePicker } from '@/lib/spaces/space-picker'

// /launch/start (VLS-07): where every "Get a Free Spotlight" button lands. The niche comes from `niche`, or from the
// door or theme the button sat on (`utm_content`); anything that is not a known niche is dropped. No account is asked
// for here: a visitor is held in the launch cookie and walks the Spotlight form, and a signed-in member starts their
// launch (or picks up the one running) and lands on /launch (lib/launch/destination.ts). The utm values ride the URL so the first-touch capture
// has already recorded them. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET(request: Request) {
  if (!launchSystemEnabled()) notFound()
  const q = new URL(request.url).searchParams
  const rawNiche = q.get('niche') ?? q.get('utm_content')
  const seed = resolveOnboardingNicheSeed(rawNiche, q.get('mode'))
  const niche = seed?.niche ?? resolvePicker({ niche: rawNiche }).niche ?? null

  // The Theme Kit to start on: the button's ?kit=, else the one they last looked at (lib/create-space/last-kit.ts). Held
  // as the Spotlight answers' theme, which the launch prefills from. A kit the builder does not offer is dropped.
  const asked = q.get('kit')
  const kitId = isPreviewKit(asked) ? asked : lastKitFrom((await cookies()).toString())

  const profileId = await getMyProfileId()
  const entry = profileId ? await ownedWizardEntry(profileId, q.get('new') === '1') : null
  if (entry) redirect(entry)
  const held = await readPendingLaunch()
  // The accent picked beside the button rides with it, as its place in the kit's list (lib/launch/carry.ts `accent`).
  const accentAt = kitId ? kitAccentIndex(kitId, q.get('accent')) : null
  const accent: Record<string, string> = accentAt !== null ? { accent: String(accentAt) } : {}
  const answers = kitId ? { ...held?.answers, spotlight: { ...held?.answers?.spotlight, theme: kitId, ...accent } } : (held?.answers ?? {})
  const explicitlyTimed = q.get('timer') === '12' || q.get('entry') === '12-minutes'
  const resume = held?.resume ? { ...held.resume, timedEntry: held.resume.timedEntry || explicitlyTimed } : (explicitlyTimed || seed ? parseWizardResume({
    version: 1, phase: 'launch', cursor: 0, theme: kitId ?? COLD_KIT, accentAt: accentAt ?? 0,
    niche, goals: seed?.goals ?? [], modeHint: seed?.mode, timedEntry: explicitlyTimed, draft: null, leadToken: null,
  }) : null)
  if (!profileId) {
    await writePendingLaunch({ niche: niche ?? held?.niche ?? null, intents: held?.intents ?? seed?.goals ?? [], answers, ...(resume ? { resume } : {}) })
    // Owner 2026-11-13: a Free Spotlight click opens the Spotlight builder, signed out too; the account is asked for at Publish.
    redirect(inFlowHref('/launch/step/spotlight'))
  }
  if (kitId || resume) await writePendingLaunch({ niche: niche ?? held?.niche ?? null, intents: held?.intents ?? seed?.goals ?? [], answers, ...(resume ? { resume } : {}) })

  const active = await getActiveLaunch(profileId)
  // An owner who asked for a NEW Space (`new=1`) is in the builder from the first step. Without that mark the launch
  // names no Space, so /launch, the rail and the feed would attach the one they already own (lib/launch/adopt-io.ts)
  // and the new Space could never be started. Someone with no Space yet keeps the usual first step.
  const startsNew = q.get('new') === '1' && (await listOwnedSpaces(profileId)).length > 0
  const base = resume ?? (startsNew ? parseWizardResume({
    version: 1, phase: 'builder', cursor: 0, theme: kitId ?? COLD_KIT, accentAt: accentAt ?? 0,
    niche, goals: seed?.goals ?? [], modeHint: seed?.mode, timedEntry: false, draft: null, leadToken: null,
  }) : null)
  const entryResume = base && startsNew ? { ...base, phase: 'builder' as const } : base
  if (active && !active.spaceId && entryResume) {
    // Opting into the clock must not replace an existing builder cursor or its full draft.
    const carried = active.resume
      ? { ...active.resume, timedEntry: active.resume.timedEntry || entryResume.timedEntry, ...(startsNew ? { phase: 'builder' as const } : {}) }
      : entryResume
    await saveWizardResume(active, carried)
  }
  if (!active) {
    const launch = await startLaunch(profileId, { niche, intents: seed?.goals ?? [] })
    if (launch) {
      if (entryResume) await saveWizardResume(launch, entryResume)
      await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
    }
  }
  redirect(launchHomeHref({ signedIn: true }))
}
