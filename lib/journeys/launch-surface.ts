// LAUNCH SURFACE SUPPORT (ADR-840). The small pure rules the /journeys/[slug]/launch page, its
// server actions, and its client list all need to agree on. Kept OUT of
// lib/journeys/launch-campaigns.ts (which owns the drafts + the schedule and is done) so the
// series library stays a pure content/date concern and the tier subset lives with the surface.
//
// PURE + framework-independent (no Supabase/Next imports), like lib/journeys/journey-access.ts:
// the page filters with it for DISPLAY and the server action re-checks with it before any write,
// so the client is never the authority on which sends a tier may schedule.
//
// Copy follows docs/CONTENT-VOICE.md and the existing pricing voice (one plain sentence plus a
// "See plans" link, the same shape as lib/journeys/publish-limits.ts): no em dashes, no urgency,
// no narrated feelings, always a real way forward.

import { LAUNCH_CAMPAIGN_KEYS, type LaunchCampaignKey } from './launch-campaigns'

/**
 * The sends a Journey WITHOUT the paid launch-campaign capability still gets: the announcement.
 * It is the one send that works on publish day with no list machinery behind it, so a free author
 * gets a real draft to copy out rather than an empty locked panel. The other three beats
 * (enrollment open, last call, kickoff) are the scheduled series, which is the paid feature.
 */
export const FREE_LAUNCH_SERIES_KEYS: readonly LaunchCampaignKey[] = ['announce']

/** Which sends this viewer may review AND schedule. The full series when the tier allows launch
 *  campaigns (resolveJourneyAccess.launchCampaignsAllowed), else the free subset. PURE. */
export function allowedLaunchKeys(launchCampaignsAllowed: boolean): readonly LaunchCampaignKey[] {
  return launchCampaignsAllowed ? LAUNCH_CAMPAIGN_KEYS : FREE_LAUNCH_SERIES_KEYS
}

/** May this viewer schedule THIS send? The server action's own re-check (never trust the client). PURE. */
export function canScheduleLaunchKey(key: LaunchCampaignKey, launchCampaignsAllowed: boolean): boolean {
  return allowedLaunchKeys(launchCampaignsAllowed).includes(key)
}

/** The quiet upgrade line under the free subset. One sentence, in the pricing voice. */
export const LAUNCH_SERIES_PAID_MESSAGE =
  'The scheduled launch series comes with a paid Space. Upgrade to send the whole run on a schedule.'

/** What the schedule action says when a tier reaches past its subset. Same voice as the surface line. */
export const LAUNCH_SERIES_LOCKED_ERROR =
  'That send is part of the scheduled launch series, which comes with a paid Space.'

/** What the surface says when a Journey has no Space behind it, so there is no list to send to.
 *  Personal Journeys get the drafts to copy, never a button that would quietly do nothing. */
export const LAUNCH_NEEDS_SPACE_MESSAGE =
  'Scheduling sends needs a Space with a contact list. Move this Journey to a Space, or copy the drafts and send them yourself.'
