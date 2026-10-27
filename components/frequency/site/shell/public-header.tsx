import { getMenu } from '@/lib/menus/read'
import { projectPublicHeader, type PublicHeaderMenu } from '@/lib/frequency/header-projection'
import { SiteHeader } from './site-header'

/** Viewer-neutral cached menu data only: public edits are crawlable without
 * reading auth/cookies or making a static page depend on the current member. */
export async function PublicHeader() {
  let initialNavigation: PublicHeaderMenu | null = null
  try { initialNavigation = projectPublicHeader(await getMenu('header'), { viewerRole: 'visitor' }) }
  catch { /* The coded Frequency header remains the safe fallback. */ }
  return <SiteHeader initialNavigation={initialNavigation} />
}
