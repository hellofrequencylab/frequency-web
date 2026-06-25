-- =============================================================================
-- Housing / roommate matching RPCs (ADR-39Y, draft)
--
-- Reuses the EXISTING resonance substrate — no new embedding model:
--   • resonance_embeddings (vector(384) gte-small) + resonance_neighbors() RPC
--   • resonance_consent (opt-in; default-deny)
--   • profiles.home_geocell_* (privacy-fuzzed geo) + listings.geocell_*
-- Roommate compatibility ranks a SEEKER against the OWNERS of roommate listings
-- by: (1) member-to-member resonance similarity, (2) structured prefs overlap,
-- (3) budget fit, (4) geo proximity. Listing relevance (rentals) is geo + price
-- + recency, no person-matching. SECURITY DEFINER + consent-gated; coordinates
-- never leave the DB (returns a coarse score, like members_near()).
-- =============================================================================

-- ── Roommate compatibility: seeker → roommate-listing owners ─────────────────
create or replace function public.housing_match_candidates(_limit int default 20)
returns table (
  listing_id   uuid,
  owner_id     uuid,
  resonance    double precision,   -- 0..1 member-to-member similarity (private)
  rent_cents   integer,
  city         text,
  score        double precision    -- blended rank (resonance + budget fit + geo)
)
language sql stable security definer set search_path = public as $$
  with me as (
    select id, home_geocell_lat as glat, home_geocell_lng as glng
    from public.profiles where auth_user_id = auth.uid()
  ),
  -- Consent gate: the caller must be opted in to receive compatibility matches.
  gate as (
    select 1 from public.resonance_consent c
    join me on me.id = c.profile_id
    where c.opted_in = true
  ),
  seeker as (
    select budget_min_cents, budget_max_cents
    from public.housing_seeker_profiles s join me on me.id = s.profile_id
    where s.active = true
  ),
  -- Member-to-member similarity from the shared embedding space.
  neighbors as (
    select n.profile_id as owner_id, n.similarity
    from me, lateral public.resonance_neighbors(me.id, 100) n
  )
  select
    l.id as listing_id,
    l.owner_profile_id as owner_id,
    coalesce(nb.similarity, 0) as resonance,
    h.rent_cents,
    l.city,
    -- Blend: 60% resonance, 25% budget fit, 15% geo proximity (coarse).
    ( 0.60 * coalesce(nb.similarity, 0)
    + 0.25 * case
               when sk.budget_max_cents is null or h.rent_cents is null then 0.5
               when h.rent_cents <= sk.budget_max_cents then 1.0
               else 0.0 end
    + 0.15 * case
               when l.geocell_lat is null or me.glat is null then 0.3
               when abs(l.geocell_lat - me.glat) < 0.2 and abs(l.geocell_lng - me.glng) < 0.2 then 1.0
               else 0.4 end
    ) as score
  from public.listings l
  join public.housing_listings h on h.listing_id = l.id and h.listing_type = 'roommate'
  cross join me
  left join seeker sk on true
  left join neighbors nb on nb.owner_id = l.owner_profile_id
  where exists (select 1 from gate)
    and l.status = 'active'
    and l.owner_profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_match_candidates(int) is
  'Consent-gated roommate compatibility: ranks roommate listings for the caller by member-to-member resonance + budget fit + coarse geo. Reuses resonance_neighbors(). Coordinates never returned. ADR-39Y.';

-- ── Rental relevance: geo + price + recency (no person-matching) ─────────────
create or replace function public.housing_rentals_near(
  _lat numeric, _lng numeric, _max_rent_cents int default null, _limit int default 40
)
returns table (
  listing_id uuid, title text, rent_cents integer, room_type text, city text, distance_band text
)
language sql stable security definer set search_path = public as $$
  select
    l.id, l.title, h.rent_cents, h.room_type, l.city,
    case
      when l.geocell_lat is null then 'unknown'
      when abs(l.geocell_lat - round(_lat,2)) < 0.05 and abs(l.geocell_lng - round(_lng,2)) < 0.05 then 'here'
      when abs(l.geocell_lat - round(_lat,2)) < 0.2  and abs(l.geocell_lng - round(_lng,2)) < 0.2  then 'nearby'
      else 'your area' end as distance_band
  from public.listings l
  join public.housing_listings h on h.listing_id = l.id and h.listing_type in ('rental','sublet')
  where l.status = 'active'
    and (_max_rent_cents is null or h.rent_cents is null or h.rent_cents <= _max_rent_cents)
    and l.geocell_lat is not null
    and abs(l.geocell_lat - round(_lat,2)) < 0.5
    and abs(l.geocell_lng - round(_lng,2)) < 0.5
  order by l.created_at desc
  limit greatest(1, least(100, coalesce(_limit, 40)));
$$;

comment on function public.housing_rentals_near(numeric,numeric,int,int) is
  'Rental/sublet discovery by coarse geocell + price ceiling + recency. Returns a distance BAND, never coordinates. ADR-39Y.';
