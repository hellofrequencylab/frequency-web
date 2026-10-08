import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSiteAdminPass } from '@/lib/sites/site-admin-pass'
import { readSiteAdminAuthor, siteAdminAllowed } from '@/lib/sites/site-admin'
import { readProfilePages } from '@/lib/spaces/profile-pages'
import { loadSpacePageDoc } from '@/lib/spaces/page-doc'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { readProfileData } from '@/lib/spaces/profile-data'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { loadMensworkLive } from '@/lib/sites/menswork-data'
import { readWebsiteEditor, RESERVED_WEBSITE_SLUGS, type WebsiteEditorState } from '@/lib/sites/editor/state'
import { refreshAssetRefUrls } from '@/lib/library/resolve-refs'
import { loadWebsiteFeatures } from '@/lib/sites/editor/live-data'
import { seedWebsiteHome, withWebsiteIds, initialWebsiteTheme } from '@/lib/sites/editor/seed'
import type { Space } from '@/lib/spaces/types'
import { siteChromeBasics } from '../site-page'
import { ConnectedWebsiteEditor } from './website-editor'

export async function WebsiteEditorPage({ host, space: cached, token }: { host: string; space: Space; token: string }) {
  const pass = readSiteAdminPass(token)
  // A staff preview pass is intentionally not a website editing credential.
  if (!pass || pass.staff) notFound()
  const { data } = await createAdminClient().from('spaces').select('preferences, owner_profile_id').eq('id', cached.id).maybeSingle()
  if (!data || !(await siteAdminAllowed(token, host, { id: cached.id, ownerProfileId: data.owner_profile_id }))) notFound()
  const space = { ...cached, preferences: data.preferences }
  setActiveSpace(space)
  const brandName = space.brandName?.trim() || space.name
  const [chrome, live, content, person] = await Promise.all([
    siteChromeBasics(space, ''), loadMensworkLive(space.id, { events: true, circles: true, journeys: true }),
    getSpaceContentData(space.id, { name: brandName, type: space.type, logoUrl: space.brandLogoUrl, coverUrl: space.coverImageUrl, tagline: space.tagline, slug: space.slug, profile: readProfileData(space.preferences) }),
    readSiteAdminAuthor(pass.profileId),
  ])
  let initial = readWebsiteEditor(space.preferences)
  if (!initial) {
    const pages = await Promise.all(readProfilePages(space.preferences).filter((p) => !RESERVED_WEBSITE_SLUGS.has(p.slug)).map(async (p) => {
      const doc = await loadSpacePageDoc(space.preferences, brandName, p.slug)
      return { slug: p.slug, label: p.label, doc: p.slug === 'home' ? seedWebsiteHome(space, doc) : withWebsiteIds(doc), seo: { title: '', description: '' }, comments: [] }
    }))
    initial = { v: 1, revision: 0, draft: { theme: initialWebsiteTheme(space.preferences), pages }, published: null, versions: [] } satisfies WebsiteEditorState
  }
  initial = { ...initial, draft: { ...initial.draft, pages: await Promise.all(initial.draft.pages.map(async (page) => ({ ...page, doc: await refreshAssetRefUrls(page.doc, { websiteSpaceId: space.id }) }))) } }
  const websiteFeatures = await loadWebsiteFeatures(space.id, initial.draft.pages.map((page) => page.doc))
  return <ConnectedWebsiteEditor host={host} brandName={brandName} logo={space.brandLogoUrl} brandAccent={space.brandAccent} author={person?.name ?? 'You'} initial={initial} metadata={{ space: content, websiteFeatures }} live={live} links={chrome.siteLinks} origin={chrome.origin} />
}
