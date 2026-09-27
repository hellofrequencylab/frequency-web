import { permanentRedirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR AND EVENTS ARE ONE PAGE (LIVE-520, owner ask: "Calendar & Events should be all one
// page"). That page is `/spaces/[slug]/calendar` — it owns the month, the agenda, the Up next
// band, the subscribable feed at calendar.ics, and every deep link the operator console writes
// (view, item, plan, console). This segment forwards to it.
//
// WHY A ROUTE EXISTS AT ALL, rather than nothing. "Events" is the word a member reaches for, and
// it was a live menu item on every Space until this row folded it in: a Home section anchor in the
// profile sub-nav beside the Calendar tab. Suppressing that anchor without giving the word
// somewhere to land would 404 the guess a reader makes, so the word keeps an address and the
// address keeps one destination.
//
// 🔴 AND THIS FILE IS EXACTLY WHY `events` HAS TO BE IN `RESERVED_PAGE_SLUGS`
// (lib/spaces/profile-pages.ts). A static App Router segment WINS over the sibling dynamic
// `[page]` segment, so an operator who named a custom profile page "Events" would get a page they
// can edit, publish and see in their own nav, and which no reader can ever open: every request to
// it lands here instead. That is the shadowing hazard the reserved set exists for, and it is why
// the reservation and this route went in as one change rather than two.
//
// `permanentRedirect` (308) rather than `redirect` (307): the fold is a product decision, not a
// temporary detour, so a crawler or a client that caches it is right to.
// ─────────────────────────────────────────────────────────────────────────────

export default async function SpaceEventsFoldedIntoCalendar({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/spaces/${slug}/calendar`)
}
