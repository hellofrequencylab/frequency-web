import { redirect } from 'next/navigation'

// THE WORD KEEPS ITS ADDRESS (LIVE-523, then ADR-1938 / LIVE-2078).
//
// A Space's conversation is its Community wall now, not a built-in Space Circle. This segment
// survives as a FORWARD rather than being deleted: `/discussion` is in `RESERVED_PAGE_SLUGS`, so it
// must keep resolving or an operator could create a custom page that shadows a URL already sent out
// in notifications, and every old link and bookmark keeps working.
//
// A 307, not a 308: the destination moved once already (it used to be `…/circles#discussion`), and
// a browser caches a 308 for good.
export default async function SpaceDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/spaces/${slug}/community`)
}
