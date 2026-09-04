-- A suspension reaches EVERY member write, not two of them (ADR-TBD, B3-3).
--
-- THE GAP. `suspendMember` (app/(main)/feed/report-actions.ts) writes profiles.suspended_at /
-- suspended_until / suspended_reason / suspended_by, and exactly ONE thing has ever read them back:
-- the trigger function `enforce_member_not_suspended`, attached BEFORE INSERT to `posts` and
-- `dispatches` and nothing else (20240207000000_moderation_actions.sql). Zero of 435 RLS policies
-- mention suspension; zero TypeScript files consult it as a gate. So a suspended member could not
-- post to the feed and could still DM, comment on a dispatch, react, RSVP, post to an event wall,
-- write in a room, review a Space, sign a guestbook, list on the market, and create an event or a
-- Circle. The sanction the moderator applied was real on two tables and decorative on thirty.
--
-- THE SECOND DEFECT, WORSE THAN THE FIRST. The function opened with
--     if auth.role() = 'service_role' then return new; end if;
-- so that "admin actions still work". But the app's own compose path
-- (app/(main)/feed/actions.ts) inserts `posts` through createAdminClient(), i.e. AS service_role, so
-- the one trigger that existed was bypassed by the one path that mattered. Re-measured on the live
-- catalog before writing this: auth.role() reads the JWT `role` claim, the service key carries
-- `service_role`, and nearly every member write in this repo goes through the admin client. The
-- exemption made the rule a no-op on its own home tables.
--
-- THE RULE, restated so it cannot be argued around: suspension is a property of the ROW'S ACTOR, not
-- of the CONNECTION that writes the row. A moderator writing their own audit row is not the actor of
-- a member's post; a cron writing a system row names a system profile; a demo seed names a demo
-- profile. None of those are suspended, so none of them need an exemption. The only writes a
-- role-based bypass ever let through were the ones the sanction exists to stop.
--
-- WHAT THIS DOES.
--   1. Rewrites `enforce_member_not_suspended` to take the ACTOR COLUMN as a trigger argument
--      (default `author_id`, so the two existing attachments keep their meaning), to drop the
--      service_role bypass, and to keep honouring `suspended_until` (a timed suspension lapses on
--      its own; that part was already right and is pinned by the pgTAP test).
--   2. Attaches it BEFORE INSERT to every table where a member authors a community-facing row,
--      using the actor column each table actually has (verified against pg_constraint: every one is
--      a uuid FK to profiles.id).
--   3. Attaches it BEFORE UPDATE OF <content columns> where an edit is a fresh contribution, so a
--      suspended member cannot keep publishing by editing what they wrote before the suspension.
--      `UPDATE OF` fires only when those columns are in the SET list, which is what keeps moderation
--      working: hiding a post sets hidden_at/hidden_by, pinning sets is_pinned, counters and
--      embeddings touch their own columns, and none of those fire the trigger.
--
-- WHAT IT REFUSES TO DO. A misattached trigger must not pass silently. The actor column is read
-- by name from NEW, so a typo in the argument is an `undefined_column` error on the very first
-- write to that table, which fails loudly instead of the sanction failing quietly. (A jsonb lookup
-- would have read NULL and waved every row through, which is the worse failure wearing a tidier
-- shape.)
--
-- THE LEDGER. lib/moderation/suspension-coverage.ts names every table attached here and every
-- table deliberately exempted (safety reports, the support channel, legal consent, money ledgers,
-- operator-authored CRM rows, a member's own private settings). Its vitest derives the universe of
-- actor+content tables from the generated schema and fails when a table is in neither list, which
-- is the gate that stops the next "enforced on one table, bypassed on the rest".
--
-- Idempotent: every trigger is dropped-if-exists before it is created, so re-running is a no-op.

begin;

create or replace function public.enforce_member_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The actor column is a trigger argument so ONE function serves every table. `author_id` is the
  -- default purely so the two original attachments (posts, dispatches) read the same as before.
  v_col       text := coalesce(tg_argv[0], 'author_id');
  v_actor     uuid;
  v_suspended boolean;
begin
  -- A trigger pointed at a column the table does not have is a sanction that silently never
  -- fires. Reading the column by name makes that an error on the first write, naming the table.
  begin
    execute format('select ($1).%I::uuid', v_col) into v_actor using new;
  exception when undefined_column then
    raise exception 'enforce_member_not_suspended: %.% has no column "%" (trigger misattached)',
      tg_table_schema, tg_table_name, v_col
      using errcode = 'undefined_column';
  end;

  -- No actor, nothing to suspend: a guest RSVP (profile_id null), a channel room (creator_id
  -- null), a poster-scanned event draft (host_id null), a system practice (created_by null).
  if v_actor is null then
    return new;
  end if;

  -- Suspended means: a suspension was applied AND it has not lapsed. A timed suspension
  -- (suspended_until in the past) is over without anyone having to clear it.
  select (p.suspended_at is not null
          and (p.suspended_until is null or p.suspended_until > now()))
    into v_suspended
    from public.profiles p
   where p.id = v_actor;

  if coalesce(v_suspended, false) then
    raise exception 'Account is suspended and cannot contribute until the suspension is lifted.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- The function was already `internal` in scripts/function-grants.txt (revoked from public, anon
-- and authenticated in 20260926000000). `create or replace` preserves the ACL, so no new grant
-- decision is made here and the ledger row is unchanged.

-- ── BEFORE INSERT: every member-authored write ──────────────────────────────────────────────────
-- Each line names the path it closes. Actor column verified against pg_constraint (FK → profiles).

-- The two original attachments, re-created with an explicit argument so they read like the rest.
-- Closes: app/(main)/feed/actions.ts (compose + reply, via the admin client), lib/circles/*.
drop trigger if exists trg_posts_block_suspended on public.posts;
create trigger trg_posts_block_suspended
  before insert on public.posts
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: app/(main)/nearby/actions.ts, lib/events/dispatch.ts, lib/spaces/dispatch.ts.
drop trigger if exists trg_dispatches_block_suspended on public.dispatches;
create trigger trg_dispatches_block_suspended
  before insert on public.dispatches
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: app/(main)/nearby/actions.ts (comment on a dispatch).
drop trigger if exists trg_dispatch_comments_block_suspended on public.dispatch_comments;
create trigger trg_dispatch_comments_block_suspended
  before insert on public.dispatch_comments
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: app/(main)/nearby/actions.ts (like a dispatch).
drop trigger if exists trg_dispatch_likes_block_suspended on public.dispatch_likes;
create trigger trg_dispatch_likes_block_suspended
  before insert on public.dispatch_likes
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/(main)/nearby/actions.ts (vote in a dispatch poll).
drop trigger if exists trg_dispatch_poll_votes_block_suspended on public.dispatch_poll_votes;
create trigger trg_dispatch_poll_votes_block_suspended
  before insert on public.dispatch_poll_votes
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/(main)/feed/actions.ts (react to a post; an upsert is an insert first).
drop trigger if exists trg_post_reactions_block_suspended on public.post_reactions;
create trigger trg_post_reactions_block_suspended
  before insert on public.post_reactions
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/(main)/messages/actions.ts, app/(main)/market/service-actions.ts,
-- lib/marketplace/listing-offers.ts, app/(main)/events/[slug]/social-actions.ts (direct messages).
-- The moderator's outreach message in report-actions.ts names the MODERATOR as sender, so it passes.
drop trigger if exists trg_messages_block_suspended on public.messages;
create trigger trg_messages_block_suspended
  before insert on public.messages
  for each row execute function public.enforce_member_not_suspended('sender_id');

-- Closes: app/(main)/messages/rooms/actions.ts (write in a room).
drop trigger if exists trg_room_messages_block_suspended on public.room_messages;
create trigger trg_room_messages_block_suspended
  before insert on public.room_messages
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: app/(main)/messages/actions.ts, app/(main)/messages/rooms/actions.ts (create a room).
-- Channel rooms are provisioned with creator_id null and pass.
drop trigger if exists trg_rooms_block_suspended on public.rooms;
create trigger trg_rooms_block_suspended
  before insert on public.rooms
  for each row execute function public.enforce_member_not_suspended('creator_id');

-- Closes: app/(main)/people/friend-actions.ts (send a connection request).
drop trigger if exists trg_friendships_block_suspended on public.friendships;
create trigger trg_friendships_block_suspended
  before insert on public.friendships
  for each row execute function public.enforce_member_not_suspended('requested_by');

-- Closes: app/(main)/events/[slug]/social-actions.ts, app/(main)/events/actions.ts (event wall).
drop trigger if exists trg_event_posts_block_suspended on public.event_posts;
create trigger trg_event_posts_block_suspended
  before insert on public.event_posts
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/(main)/events/[slug]/social-actions.ts (event photos).
drop trigger if exists trg_event_media_block_suspended on public.event_media;
create trigger trg_event_media_block_suspended
  before insert on public.event_media
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/(main)/events/actions.ts, lib/events/rsvp-depth.ts (RSVP). The guest door
-- (capture_guest_rsvp) inserts profile_id null and passes; the capacity trigger still runs.
drop trigger if exists trg_event_rsvps_block_suspended on public.event_rsvps;
create trigger trg_event_rsvps_block_suspended
  before insert on public.event_rsvps
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: lib/events/reactions.ts (react on an event wall).
drop trigger if exists trg_event_post_reactions_block_suspended on public.event_post_reactions;
create trigger trg_event_post_reactions_block_suspended
  before insert on public.event_post_reactions
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: lib/events/questions.ts (answer a host's RSVP question).
drop trigger if exists trg_event_question_answers_block_suspended on public.event_question_answers;
create trigger trg_event_question_answers_block_suspended
  before insert on public.event_question_answers
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: lib/marketplace/listing-qna-actions.ts (ask on a listing).
drop trigger if exists trg_listing_comments_block_suspended on public.listing_comments;
create trigger trg_listing_comments_block_suspended
  before insert on public.listing_comments
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: lib/marketplace/listing-offers.ts (make an offer).
drop trigger if exists trg_listing_offers_block_suspended on public.listing_offers;
create trigger trg_listing_offers_block_suspended
  before insert on public.listing_offers
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: lib/listings/index.ts (create a housing / services listing).
drop trigger if exists trg_listings_block_suspended on public.listings;
create trigger trg_listings_block_suspended
  before insert on public.listings
  for each row execute function public.enforce_member_not_suspended('owner_profile_id');

-- Closes: lib/marketplace.ts (create a market listing).
drop trigger if exists trg_market_listings_block_suspended on public.market_listings;
create trigger trg_market_listings_block_suspended
  before insert on public.market_listings
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: lib/spaces/content-actions.ts (review a Space; the upsert is an insert first).
drop trigger if exists trg_space_reviews_block_suspended on public.space_reviews;
create trigger trg_space_reviews_block_suspended
  before insert on public.space_reviews
  for each row execute function public.enforce_member_not_suspended('author_profile_id');

-- Closes: lib/commerce/reviews.ts (review a product).
drop trigger if exists trg_commerce_reviews_block_suspended on public.commerce_reviews;
create trigger trg_commerce_reviews_block_suspended
  before insert on public.commerce_reviews
  for each row execute function public.enforce_member_not_suspended('reviewer_profile_id');

-- Closes: lib/airwaves/reviews.ts (review a recording).
drop trigger if exists trg_recording_reviews_block_suspended on public.recording_reviews;
create trigger trg_recording_reviews_block_suspended
  before insert on public.recording_reviews
  for each row execute function public.enforce_member_not_suspended('reviewer_profile_id');

-- Closes: app/(main)/library/actions.ts (rate library content).
drop trigger if exists trg_content_ratings_block_suspended on public.content_ratings;
create trigger trg_content_ratings_block_suspended
  before insert on public.content_ratings
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- Closes: app/spotlight/[handle]/guestbook-actions.ts (sign a guestbook). The actor is the
-- SIGNER: a suspended member's own guestbook can still be signed by others.
drop trigger if exists trg_spotlight_guestbook_block_suspended on public.spotlight_guestbook;
create trigger trg_spotlight_guestbook_block_suspended
  before insert on public.spotlight_guestbook
  for each row execute function public.enforce_member_not_suspended('signer_profile_id');

-- Closes: Space updates (author is the member behind the Space).
drop trigger if exists trg_space_updates_block_suspended on public.space_updates;
create trigger trg_space_updates_block_suspended
  before insert on public.space_updates
  for each row execute function public.enforce_member_not_suspended('author_profile_id');

-- Closes: app/(main)/events/actions.ts, lib/circles/events.ts, lib/journeys/runs.ts (host an
-- event). Poster-scanned drafts carry host_id null until claimed and pass.
drop trigger if exists trg_events_block_suspended on public.events;
create trigger trg_events_block_suspended
  before insert on public.events
  for each row execute function public.enforce_member_not_suspended('host_id');

-- Closes: lib/circles/draft.ts, lib/circles/remix.ts (start a Circle).
drop trigger if exists trg_circles_block_suspended on public.circles;
create trigger trg_circles_block_suspended
  before insert on public.circles
  for each row execute function public.enforce_member_not_suspended('host_id');

-- Closes: lib/events/dispatch.ts (dispatch to an event's attendees).
drop trigger if exists trg_event_dispatches_block_suspended on public.event_dispatches;
create trigger trg_event_dispatches_block_suspended
  before insert on public.event_dispatches
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: app/(main)/channels/actions.ts (open a channel).
drop trigger if exists trg_channels_block_suspended on public.channels;
create trigger trg_channels_block_suspended
  before insert on public.channels
  for each row execute function public.enforce_member_not_suspended('creator_id');

-- Closes: lib/commerce/products.ts (list a product for sale).
drop trigger if exists trg_commerce_products_block_suspended on public.commerce_products;
create trigger trg_commerce_products_block_suspended
  before insert on public.commerce_products
  for each row execute function public.enforce_member_not_suspended('owner_profile_id');

-- Closes: lib/journey-plans.ts (author a Journey).
drop trigger if exists trg_journey_plans_block_suspended on public.journey_plans;
create trigger trg_journey_plans_block_suspended
  before insert on public.journey_plans
  for each row execute function public.enforce_member_not_suspended('author_id');

-- Closes: lib/practices.ts (author a practice). System practices carry created_by null and pass.
drop trigger if exists trg_practices_block_suspended on public.practices;
create trigger trg_practices_block_suspended
  before insert on public.practices
  for each row execute function public.enforce_member_not_suspended('created_by');

-- ── BEFORE UPDATE OF <content>: an edit is a fresh contribution ────────────────────────────────
-- Only the columns a member writes are listed, so moderation (hidden_at, hidden_by, status,
-- featured_at, is_pinned), counters and system columns never fire these.

drop trigger if exists trg_posts_block_suspended_edit on public.posts;
create trigger trg_posts_block_suspended_edit
  before update of body, media_urls on public.posts
  for each row execute function public.enforce_member_not_suspended('author_id');

drop trigger if exists trg_dispatches_block_suspended_edit on public.dispatches;
create trigger trg_dispatches_block_suspended_edit
  before update of title, body on public.dispatches
  for each row execute function public.enforce_member_not_suspended('author_id');

drop trigger if exists trg_dispatch_comments_block_suspended_edit on public.dispatch_comments;
create trigger trg_dispatch_comments_block_suspended_edit
  before update of body on public.dispatch_comments
  for each row execute function public.enforce_member_not_suspended('author_id');

drop trigger if exists trg_room_messages_block_suspended_edit on public.room_messages;
create trigger trg_room_messages_block_suspended_edit
  before update of body on public.room_messages
  for each row execute function public.enforce_member_not_suspended('author_id');

-- app/(main)/events/actions.ts edits an event-wall post in place.
drop trigger if exists trg_event_posts_block_suspended_edit on public.event_posts;
create trigger trg_event_posts_block_suspended_edit
  before update of body on public.event_posts
  for each row execute function public.enforce_member_not_suspended('profile_id');

drop trigger if exists trg_listing_comments_block_suspended_edit on public.listing_comments;
create trigger trg_listing_comments_block_suspended_edit
  before update of body on public.listing_comments
  for each row execute function public.enforce_member_not_suspended('profile_id');

-- lib/listings/index.ts updateListing writes title/description from the owner's edit form.
drop trigger if exists trg_listings_block_suspended_edit on public.listings;
create trigger trg_listings_block_suspended_edit
  before update of title, description on public.listings
  for each row execute function public.enforce_member_not_suspended('owner_profile_id');

drop trigger if exists trg_market_listings_block_suspended_edit on public.market_listings;
create trigger trg_market_listings_block_suspended_edit
  before update of title, description on public.market_listings
  for each row execute function public.enforce_member_not_suspended('author_id');

-- The Space owner's reply writes response_body, which is not listed, so replies keep working.
drop trigger if exists trg_space_reviews_block_suspended_edit on public.space_reviews;
create trigger trg_space_reviews_block_suspended_edit
  before update of rating, body on public.space_reviews
  for each row execute function public.enforce_member_not_suspended('author_profile_id');

drop trigger if exists trg_commerce_reviews_block_suspended_edit on public.commerce_reviews;
create trigger trg_commerce_reviews_block_suspended_edit
  before update of rating, body on public.commerce_reviews
  for each row execute function public.enforce_member_not_suspended('reviewer_profile_id');

drop trigger if exists trg_recording_reviews_block_suspended_edit on public.recording_reviews;
create trigger trg_recording_reviews_block_suspended_edit
  before update of rating, body on public.recording_reviews
  for each row execute function public.enforce_member_not_suspended('reviewer_profile_id');

drop trigger if exists trg_spotlight_guestbook_block_suspended_edit on public.spotlight_guestbook;
create trigger trg_spotlight_guestbook_block_suspended_edit
  before update of message on public.spotlight_guestbook
  for each row execute function public.enforce_member_not_suspended('signer_profile_id');

drop trigger if exists trg_space_updates_block_suspended_edit on public.space_updates;
create trigger trg_space_updates_block_suspended_edit
  before update of title, body on public.space_updates
  for each row execute function public.enforce_member_not_suspended('author_profile_id');

-- app/(main)/events/admin-actions.ts lets the host retitle and redescribe in place.
drop trigger if exists trg_events_block_suspended_edit on public.events;
create trigger trg_events_block_suspended_edit
  before update of title, description on public.events
  for each row execute function public.enforce_member_not_suspended('host_id');

drop trigger if exists trg_commerce_products_block_suspended_edit on public.commerce_products;
create trigger trg_commerce_products_block_suspended_edit
  before update of title, description on public.commerce_products
  for each row execute function public.enforce_member_not_suspended('owner_profile_id');

commit;
