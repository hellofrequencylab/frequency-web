import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { envFlag } from '@/lib/env/string'
import { createSpaceDoorHref } from '@/lib/create-space/door'
import { launchHomeHref } from '@/lib/launch/destination'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { getActiveLaunch } from '@/lib/launch/store'
import { nicheFromHint } from '@/lib/spaces/space-picker'
import { isMegaThemeId } from '@/lib/theme/mega-theme'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { listModeChoices } from '@/lib/spaces/modes'
import { setupPresetForMode } from '@/lib/pricing/bundles'
import { parsePlanHint, parseWizardHints } from '@/lib/spaces/create-wizard'
import type { SpaceType } from '@/lib/spaces/types'
import { getVeraConfig } from '@/lib/ai/vera/config'
import { CreateSpaceWizard } from './create-space-wizard'

// CREATE A SPACE — the Focus compose surface (ENTITY-SPACES-BUILD Wave B, Epic 1.6; Space Modes M3,
// ADR-461/464). A centered, no-rail form. An authenticated member answers "what do you run?" (which maps
// to a Mode + Focus), then fills name / handle / brand name / visibility; the createSpace action stands
// up the Space, seeds the Mode preset (the starter pipeline), and redirects to the owner settings surface.
//
// The "what do you run?" CHOICES come straight from the Mode registry (listModeChoices, plan §3a), so the
// wizard auto-includes every operating model the registry offers (no hardcoded list here) and each choice
// resolves to a (type, variant) the profile shell + the console both render.

export const metadata = {
  title: 'Create a space',
  description: 'Stand up a space for your practice, business, or organization on Frequency.',
  // An authenticated compose surface, not a content page: keep it out of the index and answer
  // engines (it only redirects a signed-out crawler to /sign-in).
  robots: { index: false, follow: false },
}

export default async function NewSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; plan?: string | string[]; name?: string | string[]; intents?: string | string[]; niche?: string | string[]; theme?: string | string[] }>
}) {
  // Gate: only an authenticated member may create a space (the action re-checks server-side).
  // A signed-out operator opens the wizard that needs no account, /create-a-space, carrying what the door knew (its
  // kit, mode, niche, name and picks; lib/create-space/door.ts). They build there and make the account at the end,
  // and its hand-over lands them on the launch like any member (LIVE-1969, ADR-1933). Until 2026-11-02 this bounced
  // them to /sign-in first, a form before the thing they asked for.
  const profileId = await getMyProfileId()
  const params = await searchParams
  if (!profileId) redirect(createSpaceDoorHref(params))

  // One front door (LIVE-1913). With the launch on, this page is only ever the way in: someone with a launch under way
  // goes home to it, and everyone else starts one, so a first-timer never lands on this form inside the rail.
  // /launch opens as the full-screen lightbox (lib/launch/destination.ts). With the launch off, the form below stays.
  if (launchSystemEnabled()) {
    const launch = await getActiveLaunch(profileId)
    if (launch?.resume?.phase === 'builder') redirect('/create-a-space?new=1')
    if (launch) redirect(launchHomeHref({ signedIn: true }))
    const niche = nicheFromHint(params.niche) ?? nicheFromHint((await cookies()).get('fq_beta_seq')?.value)
    const launchStart = '/launch/start'
    const query = new URLSearchParams({ new: '1', ...(niche ? { niche } : {}) })
    redirect(`${launchStart}?${query.toString()}`)
  }

  const choices = listModeChoices()
  // The niche a /for door named: an explicit `?niche=`, else the funnel sequence the visitor came through
  // (the fq_beta_seq cookie carries the door's slug). Unknown values read as no niche and cannot 404.
  const arrivedNiche = nicheFromHint(params.niche) ?? nicheFromHint((await cookies()).get('fq_beta_seq')?.value)

  // The Mega Theme a /themes page named (`?theme=`). Unknown values read as no theme and cannot 404.
  const themeHint = Array.isArray(params.theme) ? params.theme[0] : params.theme
  const arrivedTheme = isMegaThemeId(themeHint) ? themeHint : null

  // THE NICHE FUNNEL'S ANSWER, CARRIED THROUGH (ADR-1197). lib/funnels/definitions.ts builds
  // `/spaces/new?mode=<type>:<variant>` so an operator arriving from /for/<niche> lands pre-seeded in
  // the Mode that door sold them. This page took no argument until now, so the hint was dropped and the
  // form fell back to `choices[0]` — every niche door landed on "Coach", and the visitor was asked to
  // re-declare the thing they had just clicked. A test in lib/funnels/routing.test.ts asserted the URL
  // was BUILT; nothing asserted it was READ.
  //
  // The id format is `${type}:${variant}`, identical to ModeChoice.id, so the match is a lookup. An
  // unknown or absent value falls back to the first choice exactly as before: this narrows nothing and
  // cannot 404, because a stale funnel link must still land somewhere usable.
  const raw = params.mode
  const requested = Array.isArray(raw) ? raw[0] : raw
  const initialChoiceId = choices.find((c) => c.id === requested)?.id
  // THE PRICING HAND-OFF. /pricing sends `?plan=<id>` (operatorStartHref). It is a HINT: unknown or
  // missing means free, and a Space is always born free; the plan only picks where the owner lands
  // after setup (the Space's billing page). Parsed leniently so a stale link still lands somewhere usable.
  const initialPlan = parsePlanHint(params.plan)
  // The pricing calculator also hands over the Space's name and what it will do (hints, never required).
  const hints = parseWizardHints(params)
  // What each choice will be set up with, so the last step can say so before anything is created.
  const presetLabels: Record<string, string | null> = {}
  for (const c of choices) presetLabels[c.id] = setupPresetForMode(c.type as SpaceType, c.variant)?.label ?? null
  // The same operator-edited "How did you hear about us?" list signup asks (LIVE-808). Fail-safe to
  // the code defaults inside getVeraConfig.
  const heardAboutOptions = (await getVeraConfig()).induction.heardAbout

  return (
    <FocusTemplate
      title={
        <>
          Create a <span className="serif">space</span>
        </>
      }
      description="A home for your practice, business, or group. A few short steps, and you can change anything later."
      width="xl"
      divider={false}
      adminBar={false}
      back={{ href: '/spaces/directory', label: 'Spaces' }}
    >
      <CreateSpaceWizard
        choices={choices}
        initialChoiceId={initialChoiceId}
        initialPlan={initialPlan}
        initialName={hints.name}
        initialIntents={hints.intents}
        presetLabels={presetLabels}
        heardAboutOptions={heardAboutOptions}
        pickerEnabled={envFlag('SPACE_PICKER_ENABLED')}
        arrivedNiche={arrivedNiche}
        arrivedTheme={arrivedTheme}
      />
    </FocusTemplate>
  )
}
