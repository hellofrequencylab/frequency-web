-- Strip member-to-member DM bodies from the CRM timeline (owner ruling 2026-07-25, CRM-COMMS-AUDIT F2).
-- The ADR-372 Phase 1 fold copied full DM message text into contact_interactions, where the global,
-- staff-gated person view could read it. Member-to-member messaging is NOT CRM content: the timeline
-- keeps the TOUCH (summary "Messaged") but the body is scrubbed. The send-path fold no longer stores a
-- body going forward (app/(main)/messages/actions.ts recordDmTouch); this clears the historical rows.
--
-- Scope: only the auto-captured 1:1 DM folds (channel in_app + metadata.kind = 'dm'). A hand-logged
-- interaction or any other channel is untouched. Idempotent (re-running is a no-op once bodies are null).

update public.contact_interactions
   set body = null
 where channel = 'in_app'
   and metadata->>'kind' = 'dm'
   and body is not null;
