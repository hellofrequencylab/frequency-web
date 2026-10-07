'use server'

// SPACE SPOTLIGHT actions (LIVE-851). The two writes the console Spotlight editor makes: the builder's
// debounced layout save and the publish switch. Both re-resolve the Space by slug, gate FAIL-CLOSED on
// resolveSpaceManageAccess(...).canManage (a staff previewer cannot write), and write ONLY the
// `preferences.spotlight` node through nextSpotlightPreferences, which sanitizes the layout and narrows it
// to Spotlight blocks, so every other preferences key (the Space page, the website) is untouched.
//
// The Spotlight has no draft: its own publish switch is what keeps it off the network, so a save lands on
// the node the public page reads, and the cached page is revalidated. No em dashes (owner copy).
//
// THE OWN LINKS (LIVE-855). Publishing on a plan that takes payments attaches `<slug>.frequencylocal.com` to
// hosting (best effort, as the website's publish does), so `<slug>.frequencylocal.com/spotlight` answers.
// connectSpotlightDomain attaches `spotlight.<domain>` for a Space whose own domain is served. Every save
// also refreshes the cached website (refreshSite), which carries the Spotlight on those hosts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { nextSpotlightPreferences } from '@/lib/spaces/spotlight'
import { spaceCanTakePayments } from '@/lib/pricing/payments-gate'
import { refreshSite } from '@/lib/sites/site-cache'
import { siteSubdomainHost } from '@/lib/sites/host'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { addSiteSubdomain } from '@/lib/sites/vercel-domains'
import { briefError, log } from '@/lib/log'
import type { Space } from '@/lib/spaces/types'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'

type SpotlightChange = { published?: boolean; layout?: unknown }

/** The Space, when the caller may manage it. */
async function managedSpace(slug: string): Promise<{ space: Space } | { error: string }> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return { error: 'Space not found.' }
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return { error: 'You do not have permission to edit this space.' }
  return { space }
}

/** Attach a host to hosting, logging a failure so the fallback firing is visible. Never throws. */
async function attachHost(host: string, slug: string): Promise<boolean> {
  try {
    const attached = await addSiteSubdomain(host)
    if (!attached.ok) log.warn('spotlight_host_attach_failed', { slug, host, error: attached.error })
    return attached.ok
  } catch (err) {
    log.warn('spotlight_host_attach_failed', { slug, host, error: briefError(err) })
    return false
  }
}

async function writeSpotlight(slug: string, change: SpotlightChange): Promise<{ error?: string }> {
  const managed = await managedSpace(slug)
  if ('error' in managed) return managed
  const { space } = managed

  const current =
    space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? (space.preferences as Record<string, unknown>)
      : {}
  const preferences = nextSpotlightPreferences(current, change)

  // Untyped scoped update of the preferences jsonb (ADR-246: the column is not in the generated types).
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences }).eq('id', space.id)
  if (error) return { error: 'Could not save your Spotlight. Try again.' }

  revalidatePath(`/spaces/${space.slug}/spotlight`)
  revalidatePath(`/spaces/${space.slug}/manage/spotlight`)
  refreshSite(space.slug)

  // The paid link: `<slug>.frequencylocal.com/spotlight` needs the subdomain on hosting.
  const subdomain = change.published === true ? siteSubdomainHost(space.slug) : null
  if (subdomain && (await spaceCanTakePayments(space.id, { plan: space.plan ?? null }))) await attachHost(subdomain, space.slug)
  return {}
}

/** Put the Spotlight on `spotlight.<domain>` for a Space whose own domain is served: attach the host. The
 *  owner then adds one CNAME record at their registrar, which the editor shows. */
export async function connectSpotlightDomain(slug: string): Promise<{ error?: string }> {
  const managed = await managedSpace(slug)
  if ('error' in managed) return managed
  const domain = await boundSiteDomain(managed.space)
  if (!domain) return { error: 'Connect your own domain to your website first.' }
  if (!(await attachHost(`spotlight.${domain}`, managed.space.slug))) {
    return { error: 'Could not connect it just now. Try again in a minute.' }
  }
  return {}
}

/** The builder's debounced save: the working layout, narrowed to a one-column Spotlight on write. */
export async function saveSpaceSpotlightLayout(slug: string, layout: BuilderLayout): Promise<{ error?: string }> {
  return writeSpotlight(slug, { layout })
}

/** The publish switch: puts the Spotlight on the network, or takes it off. The layout is kept either way. */
export async function setSpaceSpotlightPublished(slug: string, published: boolean): Promise<{ error?: string }> {
  return writeSpotlight(slug, { published: published === true })
}
