import { permanentRedirect } from 'next/navigation'

// THE WORD KEEPS ITS ADDRESS (LIVE-523, ADR-1534 amending ADR-1469 §2).
//
// Discussion is no longer a tab beside Circles. A Space's community is ONE page: the Space Circle's
// feed leads `/spaces/<slug>/circles` and the other circles are indexed under it. Two menu rows over
// one subject is the bug this closes, in its fifth edition after reviews, circles, contact and
// events (#2916).
//
// This segment survives as a FORWARD rather than being deleted, for the reasons the repo already
// pays for elsewhere: `/discussion` is in `RESERVED_PAGE_SLUGS`, so it must keep resolving or an
// operator could create a custom page that shadows a URL already sent out in notifications; and
// every link, bookmark and revalidatePath() call that names it keeps working.
//
// It lands on `#discussion`, the anchor the conversation band mounts, so an old link opens on the
// conversation rather than at the top of the index.
//
// PERMANENT (308) and not a 307, deliberately: this is a merge, not a toggle. The cached-308 hazard
// the Circles tab's own header warns about is a 308 onto a page that then 404s — the `circles` tab
// REDIRECTS rather than 404s for exactly that reason, so this destination always resolves.

export default async function SpaceDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  permanentRedirect(`/spaces/${slug}/circles#discussion`)
}
