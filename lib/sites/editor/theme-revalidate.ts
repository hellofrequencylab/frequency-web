import { refreshSite } from '@/lib/sites/site-cache'

// A THEME CHANGE REFRESHES ONE SPACE'S SITE AND NOTHING ELSE (LIVE-1864, docs/THEME-COHESION.md).
//
// No rebuild and no deploy is involved. The site routes are ISR; every cached read a render makes
// carries the tag `site:<slug>`, and refreshSite expires exactly that tag plus the /sites/<slug> tree.
// So the next visitor to that Space regenerates its page set, on /sites/<slug> and on its own domain,
// and every other Space (and the app itself) keeps serving what it has. The call is anonymous: it
// touches cache tags only, never a request, a cookie or a Supabase client.

/** Expire the cached site of the one Space whose theme (or look) just changed. */
export function revalidateThemeChange(spaceSlug: string): void {
  refreshSite(spaceSlug)
}
