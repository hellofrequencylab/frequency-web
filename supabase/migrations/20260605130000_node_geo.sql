-- Location-aware earning: author a check-in node's geofence from the Studio.
-- The pieces already exist (nodes.location geography + nodes.proximity_m + the
-- node_within_range RPC used by verifyCapture) — what's missing is a safe way to
-- WRITE the PostGIS point from the app (PostgREST can't build a geography from
-- lat/lng directly) and READ it back for the editor. Two additive SECURITY DEFINER
-- functions, no schema change. ADDITIVE.

-- Set (or clear) a node's geofence. Null lng/lat clears the requirement entirely.
create or replace function public.set_node_geo(
  p_node_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_proximity_m integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nodes set
    location = case
      when p_lng is null or p_lat is null then null
      else public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography
    end,
    proximity_m = case when p_lng is null or p_lat is null then null else p_proximity_m end
  where id = p_node_id;
end;
$$;

-- Read every geofenced node's coordinates + radius back for the Studio editor.
create or replace function public.nodes_geo()
returns table(id uuid, lng double precision, lat double precision, proximity_m integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    public.st_x(n.location::public.geometry) as lng,
    public.st_y(n.location::public.geometry) as lat,
    n.proximity_m
  from public.nodes n
  where n.location is not null;
$$;
