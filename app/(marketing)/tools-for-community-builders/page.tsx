import { permanentRedirect } from 'next/navigation'

// /tools-for-community-builders MERGED into /how-to-build-community (2026-10-19, SCAN-1017). The
// "four jobs" (a way in, a place to gather, a shared feed, recognition) now sit inside the operator
// guide as one section, where the reader who searches "how to build community" already is. Under the
// Frequency design nothing linked here except one card on /spaces, and the page leaned on internal
// nouns (Runs, Dispatch, Zaps, Gems) a stranger has not met yet.
//
// A route-level redirect, not a next.config rule: lib/marketing/redirect-shadow.test.ts refuses a rule
// that shadows a live route, and the LIVE-912 probe (scripts/probes/launch-0-3-lab-naming.mjs) reads
// this file and its template by path. The template is kept as source, as the-lab's was (ADR-1747).
export default function ToolsForCommunityBuildersPage(): never {
  permanentRedirect('/how-to-build-community')
}
