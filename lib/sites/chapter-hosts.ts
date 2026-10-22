import { briefError, log } from '@/lib/log'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { getSpaceById, getSpaceHostRow, listChapterHostRows, publishSpaceWebsite } from '@/lib/spaces/store'
import { readWebsitePublished } from '@/lib/spaces/website'
import { refreshSite } from '@/lib/sites/site-cache'
import { networkChapterHost } from '@/lib/sites/host'
import { chapterSiteHost } from '@/lib/sites/site-domain'
import { addSiteSubdomain } from '@/lib/sites/vercel-domains'

// CHAPTER SUBDOMAINS, THE HOSTING SIDE (owner ask 2026-10-22). A Network on its own domain gives each
// chapter `<slug>.<domain>` (lib/sites/host.ts networkChapterHost). Vercel serves a host, and issues its
// certificate, only once the host is attached to the project, so this attaches them. One host per
// chapter, never a wildcard domain: a wildcard certificate needs the domain's nameservers on Vercel, and
// the owner's DNS stays where it is (one `*` CNAME record sends every chapter host to Vercel).
// BEST EFFORT and NEVER THROWS, like addSiteSubdomain: a failure only logs.

async function attach(host: string, why: string): Promise<void> {
  const attached = await addSiteSubdomain(host)
  if (!attached.ok) log.warn('chapter_host_attach_failed', { host, why, error: attached.error })
}

/** Attach every active chapter's host for the Network `networkId` that holds `networkDomain`. */
export async function attachChapterHosts(networkId: string): Promise<void> {
  try {
    const network = await getSpaceHostRow(networkId)
    if (!network?.domain || network.status !== 'active' || !isNetworkPlan(network.plan)) return
    for (const row of await listChapterHostRows(network.id)) {
      if (row.owner_profile_id !== network.owner_profile_id) continue
      const host = networkChapterHost(row.slug, network.domain, network.slug)
      if (host) await attach(host, 'network-domain')
    }
  } catch (err) {
    log.warn('chapter_hosts_attach_threw', { networkId, message: briefError(err) })
  }
}

/** Attach one Space's chapter host, when it is a chapter of a Network that holds a domain. */
export async function attachChapterHostFor(spaceId: string): Promise<void> {
  try {
    const row = await getSpaceHostRow(spaceId)
    if (!row) return
    const host = await chapterSiteHost({ slug: row.slug, domain: row.domain, parentId: row.parent_id, ownerProfileId: row.owner_profile_id })
    if (host) await attach(host, 'chapter-publish')
  } catch (err) {
    log.warn('chapter_host_attach_threw', { spaceId, message: briefError(err) })
  }
}

/** A chapter joins a Network whose website is live: its starter site goes live too (LIVE-1283). The chapter's
 *  site wears the Network's look, footer and pages (lib/sites/network-inheritance.ts) until the chapter writes
 *  its own, and its address attaches. A Network whose own site is not published starts nothing, and a chapter
 *  already published is left as it was. BEST EFFORT and NEVER THROWS. */
export async function startChapterSite(chapterId: string): Promise<void> {
  try {
    const chapter = await getSpaceHostRow(chapterId)
    const network = chapter?.parent_id ? await getSpaceById(chapter.parent_id) : null
    if (!chapter || !network || network.status !== 'active' || !isNetworkPlan(network.plan) || network.ownerProfileId !== chapter.owner_profile_id) return
    if (!readWebsitePublished(network.preferences)) return
    if (await publishSpaceWebsite(chapter.id)) refreshSite(chapter.slug)
    await attachChapterHostFor(chapter.id)
  } catch (err) {
    log.warn('chapter_site_start_threw', { chapterId, message: briefError(err) })
  }
}
