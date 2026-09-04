// SUSPENSION COVERAGE LEDGER (ADR-TBD, B3-3).
//
// A member suspension (profiles.suspended_at / suspended_until, written by suspendMember in
// app/(main)/feed/report-actions.ts) is enforced in exactly one place: the trigger function
// `enforce_member_not_suspended`, attached per table by
// supabase/migrations/20270344000000_suspension_reaches_every_member_write.sql. For two years it
// was attached to `posts` and `dispatches` and nothing else, and nothing noticed, because nothing
// stated which tables a suspension was SUPPOSED to reach. This file is that statement.
//
// Two lists, and every table that could plausibly need a verdict must be on one of them:
//
//   • SUSPENSION_COVERED — tables where a member authors a community-facing row. The migration
//     attaches the trigger BEFORE INSERT using the named actor column, and BEFORE UPDATE OF the
//     named edit columns where an edit is a fresh contribution.
//   • SUSPENSION_EXEMPT — tables a suspension deliberately does NOT block, each with the reason.
//     An exemption without a reason is a gap with better handwriting.
//
// The test next door derives the universe from lib/database.types.ts (every table with an
// actor-shaped column AND a content-shaped column) and fails when one is on neither list. That is
// the gate: a new member-write table lands red until somebody decides, in this file, whether the
// sanction reaches it. It also pins the migration to this ledger in both directions, so the SQL
// cannot attach to a table this file does not name, or skip one it does.
//
// This module is pure data so the test, and any future admin surface, can read it without a client.

/** A table the trigger is attached to: the actor column (a uuid FK to profiles.id) and, where a
 *  member can edit what they wrote, the content columns whose UPDATE is also a contribution. */
export type SuspensionCoverage = {
  /** The column that names the member who authored the row. */
  actor: string
  /** Columns whose UPDATE is a fresh contribution (the migration uses `before update of ...`).
   *  Absent when the table has no member edit path, or the row is immutable once written. */
  edit?: readonly string[]
}

export const SUSPENSION_COVERED = {
  // ── Feed ──
  posts: { actor: 'author_id', edit: ['body', 'media_urls'] },
  post_reactions: { actor: 'profile_id' },
  // ── Dispatches (Nearby) ──
  dispatches: { actor: 'author_id', edit: ['title', 'body'] },
  dispatch_comments: { actor: 'author_id', edit: ['body'] },
  dispatch_likes: { actor: 'profile_id' },
  dispatch_poll_votes: { actor: 'profile_id' },
  // ── Messaging ──
  messages: { actor: 'sender_id' },
  room_messages: { actor: 'author_id', edit: ['body'] },
  rooms: { actor: 'creator_id' },
  friendships: { actor: 'requested_by' },
  // ── Events ──
  events: { actor: 'host_id', edit: ['title', 'description'] },
  event_posts: { actor: 'profile_id', edit: ['body'] },
  event_media: { actor: 'profile_id' },
  event_rsvps: { actor: 'profile_id' },
  event_post_reactions: { actor: 'profile_id' },
  event_question_answers: { actor: 'profile_id' },
  event_dispatches: { actor: 'author_id' },
  // ── Circles / channels ──
  circles: { actor: 'host_id' },
  channels: { actor: 'creator_id' },
  // ── Market / listings ──
  listings: { actor: 'owner_profile_id', edit: ['title', 'description'] },
  market_listings: { actor: 'author_id', edit: ['title', 'description'] },
  listing_comments: { actor: 'profile_id', edit: ['body'] },
  listing_offers: { actor: 'profile_id' },
  commerce_products: { actor: 'owner_profile_id', edit: ['title', 'description'] },
  // ── Reviews / ratings ──
  space_reviews: { actor: 'author_profile_id', edit: ['rating', 'body'] },
  commerce_reviews: { actor: 'reviewer_profile_id', edit: ['rating', 'body'] },
  recording_reviews: { actor: 'reviewer_profile_id', edit: ['rating', 'body'] },
  content_ratings: { actor: 'profile_id' },
  // ── Spaces / Spotlight ──
  space_updates: { actor: 'author_profile_id', edit: ['title', 'body'] },
  spotlight_guestbook: { actor: 'signer_profile_id', edit: ['message'] },
  // ── Authored content ──
  journey_plans: { actor: 'author_id' },
  practices: { actor: 'created_by' },
} as const satisfies Record<string, SuspensionCoverage>

/** Tables a suspension deliberately does NOT reach. Keyed by table, valued by the reason, because
 *  the reason is the decision and a bare name would read as an oversight in a year. */
export const SUSPENSION_EXEMPT: Record<string, string> = {
  // Safety and appeal channels stay open: a suspended member must still be able to report abuse
  // and to reach support, or the sanction becomes a way to silence the person it was applied to.
  reports: 'safety reporting stays open to a suspended member',
  marketplace_reports: 'safety reporting stays open to a suspended member',
  support_tickets: 'the support channel is the appeal path',
  support_ticket_messages: 'the support channel is the appeal path',
  // Legal records are never blocked; refusing to record consent is the worse failure.
  consent_records: 'legal record; a withdrawal of consent must always land',
  sms_consent: 'legal record; a withdrawal of consent must always land',
  // Money ledgers are written by webhooks and system paths; a raise here desyncs Stripe.
  financial_transactions: 'ledger row written by webhooks and system paths',
  commerce_orders: 'ledger row written by checkout and webhooks',
  supporter_contributions: 'ledger row written by webhooks',
  zap_transactions: 'economy ledger written by system paths',
  gem_transactions: 'economy ledger written by system paths',
  // Operator-authored rows sit behind operator authz. A suspension is a MEMBER sanction; the
  // created_by on these names an operator doing their job.
  campaigns: 'operator-authored (Email Studio / marketing)',
  crm_activities: 'operator-authored (CRM)',
  crm_deals: 'operator-authored (CRM)',
  crm_tasks: 'operator-authored (CRM)',
  client_notes: 'operator-authored (CRM)',
  contact_interactions: 'operator-authored (CRM)',
  comms_messages: 'the Space inbox; author_kind may be a contact or the system, not a member post',
  email_templates: 'operator-authored (Email Studio)',
  funnels: 'operator-authored (growth)',
  segments: 'operator-authored (traits)',
  qr_codes: 'operator- or owner-authored entry points, behind entry-point authz',
  automation_rules: 'operator-authored (automations)',
  nurture_sequences: 'operator-authored (nurture)',
  entry_campaigns: 'operator-authored (funnels)',
  library_assets: 'operator-authored (library)',
  library_collections: 'operator-authored (library)',
  library_versions: 'operator-authored (library)',
  space_venue_holds: 'a Space-side scheduling record, not a member post',
  // Private to the member: a suspension blocks contribution to the community, not the member's
  // own settings, notes and logs. Blocking these would also break the account-management flows.
  network_contact_notes: 'private CRM note visible only to its author',
  practice_sessions: 'the member’s own practice log',
  profile_personas: 'the member’s own persona claim',
  notification_preferences: 'the member’s own settings',
  push_subscriptions: 'the member’s own settings',
  subject_topic_preferences: 'the member’s own settings',
  suggestion_hidden: 'the member’s own settings',
  member_match_prefs: 'the member’s own settings',
  listing_saves: 'a private bookmark',
  contact_import: 'the member’s own contact import',
  custom_field_registry: 'the member’s own field definitions',
  // Derivative of a covered write, or a roster row rather than a contribution.
  conversations: 'derivative: a conversation with no messages is inert, and messages are covered',
  conversation_participants: 'derivative of conversations',
  post_mentions: 'derivative: written only after the covered posts insert succeeds',
  room_members: 'roster row; joining a room is not a contribution',
  memberships: 'roster row written by hosts and admins as often as by the member',
}

/** Column names that mark a row as authored by a member. Kept here, next to the ledger, so the
 *  test and the ledger agree on what "actor-shaped" means. */
export const ACTOR_COLUMNS = [
  'author_id',
  'sender_id',
  'requested_by',
  'creator_id',
  'host_id',
  'owner_profile_id',
  'reviewer_profile_id',
  'author_profile_id',
  'signer_profile_id',
  'reporter_id',
  'created_by',
  'posted_by_profile_id',
  'profile_id',
] as const

/** Column names that mark a row as carrying something other people read. A table with an actor
 *  column and none of these (a join row, a preference row) is not in the universe the gate scans,
 *  though it may still be covered on purpose (reactions, likes, votes, RSVPs). */
export const CONTENT_COLUMNS = [
  'body',
  'message',
  'description',
  'title',
  'caption',
  'rating',
  'reaction_type',
  'amount_cents',
  'image_url',
  'media_url',
  'media_urls',
  'text',
  'content',
  'note',
  'notes',
] as const
