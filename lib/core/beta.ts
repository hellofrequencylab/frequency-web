// Beta launch switch (TEMPORARY) — "get people in and let them try everything".
//
// While this is true, every signed-in member is treated as the paid Crew TIER, so all
// premium member features unlock (the Vault cash-in, Studio, Support console, Connections /
// personal CRM, QR Studio — every `isPaid` / `crew`-column gate in the access matrix), AND
// any member may author practices (kept PENDING for Host+ approval, so nothing unvetted goes
// public). It is purely an ENTITLEMENT + member-creation opener.
//
// It does NOT grant any community ROLE and does NOT touch the STAFF axis (`web_role`): the
// admin/operator surfaces (platform management, the financial dashboard, content moderation /
// approval, role assignment) stay locked to staff. Nothing destructive or cross-member opens.
//
// The DB is untouched (real `membership_tier` / `community_role` are preserved), so flipping
// this back to false restores normal tier + role gating with no migration. Remove this flag
// and its read sites when real membership tiers launch (ADR in docs/DECISIONS.md).
export const BETA_OPEN_ACCESS = true

/** The tier every signed-in member is granted while {@link BETA_OPEN_ACCESS} is on. */
export const BETA_GRANTED_TIER = 'crew' as const
