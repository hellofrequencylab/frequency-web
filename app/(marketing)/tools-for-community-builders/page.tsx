import { permanentRedirect } from 'next/navigation'
import { spec as guide } from '@/lib/page-editor/templates/how-to-build-community'

// /tools-for-community-builders MERGED into /how-to-build-community (2026-10-19, SCAN-1017, ADR-1761).
// The "four jobs" (a way in, a place to gather, a shared feed, recognition) now sit inside the operator
// guide as one section, where the reader who searches "how to build community" already is. Under the
// Frequency design nothing linked here except one card on /spaces, and the page leaned on internal
// nouns (Runs, Dispatch, Zaps, Gems) a stranger has not met yet.
//
// WHY THIS FILE STILL EXISTS. HYG-043's rule is right: a redirect belongs in next.config, as the-lab's
// did (ADR-1747). Two things keep the file: the LIVE-912 probe (scripts/probes/launch-0-3-lab-naming.mjs)
// reads it by path, and lib/marketing/redirect-shadow.test.ts refuses a next.config rule over a route
// that still exists. So the route stays and follows the guide's own slug, so it cannot drift from the
// page it merged into. Delete this file and move the rule to next.config once that probe's scope drops
// it. The template is kept as source, as the-lab's was (ADR-1747).
export default function ToolsForCommunityBuildersPage(): never {
  permanentRedirect(`/${guide.slug}`)
}
