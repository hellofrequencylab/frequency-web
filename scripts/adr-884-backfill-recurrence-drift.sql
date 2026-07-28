-- ADR-884 · REPAIR THE RECURRENCE OCCURRENCES THAT WERE BUILT FROM COLUMN DEFAULTS
--
-- WHY THIS EXISTS. generateOccurrencesForAnchor used to build each materialized occurrence from a
-- hand-listed payload of ten columns. Every column NOT on that list fell to its database DEFAULT,
-- and the defaults are not neutral: visibility -> circle_only, price_cents -> NULL (which the event
-- page renders as a free RSVP), capacity -> NULL, and trigger events_default_space_id rewrites a
-- NULL space_id to the ROOT Space.
--
-- The live damage, measured before writing this: both recurring series in production are $22.00
-- public events, and ALL 16 upcoming occurrences were free, circle_only and uncapped. The seven
-- belonging to "Meld - Community Cowork" were additionally re-tenanted from Royal Temple, a paying
-- Collective customer, to root with host_space_id NULL, so ticket money would not have routed to
-- the business. The circle_only value made them invisible rather than merely narrow, because the
-- RLS circle_only branch admits scope_type 'circle' or 'region' and no writer emits 'region'.
--
-- The code fix closes the mechanism (one INHERITED_COLUMNS constant now drives both the anchor
-- SELECT and the child payload) but repairs nothing: generateOccurrencesForAnchor uses
-- ignoreDuplicates: true, so it will never overwrite a row that already exists. Hence this script.
--
-- THE COLUMN LIST IS GENERATED FROM lib/event-recurrence.ts, NOT retyped. A drift test
-- (lib/event-recurrence.test.ts) parses both this file and that constant and fails if they differ,
-- so a column added to the generator can never be silently omitted from the repair.
--
-- SCOPE: UPCOMING occurrences only (starts_at >= now()). A past occurrence is the record of an
-- event that already happened; rewriting its price or capacity after the fact would be inventing
-- history, not repairing it. One such row exists and is deliberately left alone.
--
-- SAFE TO RE-RUN: the SET list is a straight copy from the anchor, so a second run is a no-op.
-- Never touches a child's own identity (starts_at, ends_at, slug, parent_event_id).

-- ── VERIFY BEFORE ───────────────────────────────────────────────────────────────────────────────
select a.title as series, count(*) as upcoming_children,
       count(*) filter (where c.price_cents is distinct from a.price_cents)   as price_drift,
       count(*) filter (where c.visibility is distinct from a.visibility)     as vis_drift,
       count(*) filter (where c.capacity is distinct from a.capacity)         as cap_drift,
       count(*) filter (where c.space_id is distinct from a.space_id)         as space_drift,
       count(*) filter (where c.title is distinct from a.title)               as title_drift
  from public.events a
  join public.events c on c.parent_event_id = a.id
 where a.parent_event_id is null and c.starts_at >= now()
 group by 1;

-- ── THE REPAIR ──────────────────────────────────────────────────────────────────────────────────
update public.events c set
  title = a.title,
  description = a.description,
  host_id = a.host_id,
  scope_id = a.scope_id,
  scope_type = a.scope_type,
  location = a.location,
  visibility = a.visibility,
  status = a.status,
  published_at = a.published_at,
  price_cents = a.price_cents,
  currency = a.currency,
  capacity = a.capacity,
  venmo_handle = a.venmo_handle,
  join_mode = a.join_mode,
  category = a.category,
  energy_tag = a.energy_tag,
  time_zone = a.time_zone,
  cover_image_path = a.cover_image_path,
  gallery_image_paths = a.gallery_image_paths,
  poster_path = a.poster_path,
  theme = a.theme,
  details = a.details,
  space_id = a.space_id,
  host_space_id = a.host_space_id,
  domain_id = a.domain_id,
  attendance_mode = a.attendance_mode,
  online_url = a.online_url,
  venue_name = a.venue_name,
  street = a.street,
  city = a.city,
  region = a.region,
  country = a.country,
  postal_code = a.postal_code,
  geog = a.geog,
  hide_address = a.hide_address,
  journey_id = a.journey_id,
  source = a.source,
  is_demo = a.is_demo,
  posted_by_profile_id = a.posted_by_profile_id,
  organizer_name = a.organizer_name,
  organizer_contact = a.organizer_contact
  from public.events a
 where c.parent_event_id = a.id
   and a.parent_event_id is null
   and c.starts_at >= now();

-- ── VERIFY AFTER (every drift count must read 0) ────────────────────────────────────────────────
select a.title as series, count(*) as upcoming_children,
       count(*) filter (where c.price_cents is distinct from a.price_cents)   as price_drift,
       count(*) filter (where c.visibility is distinct from a.visibility)     as vis_drift,
       count(*) filter (where c.capacity is distinct from a.capacity)         as cap_drift,
       count(*) filter (where c.space_id is distinct from a.space_id)         as space_drift,
       count(*) filter (where c.title is distinct from a.title)               as title_drift
  from public.events a
  join public.events c on c.parent_event_id = a.id
 where a.parent_event_id is null and c.starts_at >= now()
 group by 1;
