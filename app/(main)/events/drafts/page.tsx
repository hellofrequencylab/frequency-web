import { permanentRedirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// MOVED TO /drafts (owner ruling 2026-08-12, "fold /events/drafts into /drafts as a third row
// kind, and add the NAMING.md entry defining Drafts as the one surface").
//
// This list was a second member surface titled "My drafts", about captured poster events, while
// /drafts said Drafts about Vera's proposals and staged wizard answers. docs/NAMING.md now pins
// Drafts to /drafts alone, and the captured events render there as a third row kind.
//
// A REDIRECT, NOT A DELETION, and the choice is deliberate. This was a live member surface with
// real inbound links (the Events header, the poster-scan page, both editor back-links) and the
// kind of thing a member bookmarks after capturing a poster; every link in the repo has moved,
// but a bookmark cannot be edited from here. Deleting the file would ALSO 404 a path whose own
// child route still exists — `/events/drafts/<id>` is the per-event editor and is unchanged — so
// the segment would answer for a draft and not for the list above it, which is the worst of both.
// A stub costs one module and forwards anyone who arrives.
//
// `permanentRedirect` (308) rather than `redirect` (307): the move is permanent, so a crawler or
// a client that caches it is right to.
// ─────────────────────────────────────────────────────────────────────────────

export default async function MyEventDraftsMoved() {
  permanentRedirect('/drafts')
}
