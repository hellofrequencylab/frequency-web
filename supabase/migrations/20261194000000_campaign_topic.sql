-- Topic-tagged space emails (ADR-799 Decision C). A space campaign now carries a TOPIC
-- (marketing / events / dispatches) so the per-recipient send gate can honor the contact's
-- per-topic mute (contact_channel_preferences), replacing the hardcoded 'marketing' in the send loop.
--
-- The keys mirror CONTACT_TOPICS (lib/comms/contact-preferences): a contact who muted a topic in the
-- preference center is skipped on the matching send. The `campaigns` table also backs the block-email
-- drafts, so this one column covers both broadcast composers.
--
-- BACK-COMPAT: NOT NULL DEFAULT 'marketing' backfills every existing row to today's effective topic, so
-- already-sent + scheduled campaigns behave exactly as before. `campaigns` has RLS enabled with no client
-- policies (20260714000000_space_email.sql), so the column is reachable only through the gated server
-- actions; the code reads it fail-safe (normalizeEmailTopic) so the app works before this is applied and
-- before lib/database.types.ts is regenerated (ADR-246). Additive + idempotent. Reversible:
-- `alter table public.campaigns drop column topic`.

alter table public.campaigns
  add column if not exists topic text not null default 'marketing'
    check (topic in ('marketing', 'events', 'dispatches'));

comment on column public.campaigns.topic is
  'The topic this space email is tagged with (ADR-799 C): marketing | events | dispatches. Mirrors CONTACT_TOPICS; the send loop gates each recipient''s per-topic mute on this. Defaults to marketing (the pre-topic behavior).';
