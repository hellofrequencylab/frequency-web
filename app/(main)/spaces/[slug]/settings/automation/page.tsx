import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import {
  resolveSpaceManageAccess,
  getSpaceCapabilities,
  spaceHasEntitlement,
} from '@/lib/spaces/entitlements'
import { AutomationBody } from './automation-body'

// OWNER AUTOMATION SURFACE (R5, business-accounts Automation). A centered, no-rail-less Focus surface at
// /spaces/<slug>/settings/automation, registered like the other owner settings sub-pages (it matches the
// /spaces/<slug>/settings pattern in page-chrome.ts, so it keeps the standard chrome). It resolves the
// Space, gates RENDER on canManage || staffViewing (404s otherwise so a non-editor / non-staff viewer
// cannot tell the surface exists), then wraps the chrome-free <AutomationBody> in the FocusTemplate.
//
// GATE: automation is a CRM amplifier, gated on the `crm.space.automation` capability
// (spaceHasEntitlement 'automation'). When a Space's plan lacks it, the body renders a plain upgrade
// notice (never a dead 404) so an owner sees "here's what this is + how to get it". Every WRITE action
// stays gated on canEditProfile server-side (in lib/spaces/automation.ts), so staff preview is read-only.
//
// VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'Automation',
}

export default async function SpaceAutomationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // The automation entitlement gap keeps the plain framing + short description (like the Email surface's
  // locked branch); the full editor gets the wide framing. AutomationBody re-derives this same condition
  // so the two never diverge.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !spaceHasEntitlement(space, 'automation')

  if (featureLocked) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Automation"
        description="Rules and drip sequences for this space."
      >
        <AutomationBody slug={slug} />
      </FocusTemplate>
    )
  }

  void caps
  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Automation"
      description="Set up rules that fire on a trigger, and drip sequences that email your own contacts on a schedule."
      width="wide"
    >
      <AutomationBody slug={slug} />
    </FocusTemplate>
  )
}
