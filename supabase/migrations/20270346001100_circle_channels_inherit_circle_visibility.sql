-- =============================================================================
-- circle_channels inherits the Circle's visibility (SCAN-651).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- THE LEAK. 20270345011400_circle_channels.sql gave the join a public read, `using (true)`, with
-- select granted to anon and authenticated. An unlisted, closed Circle is meant to be invisible to
-- anyone who cannot enter it (ADR-1015, circles_access_restrictive), yet
-- `select * from circle_channels` over PostgREST with the anon key returned every hidden Circle's
-- uuid and the Channels it carries.
--
-- NOT A REVOKE. scripts/table-grants.txt records that the signed-out Circles index embeds this
-- table on the session client, so pulling the anon grant would break that embed. The policy
-- instead asks whether the CALLER can see the Circle: the subquery on public.circles runs under
-- the caller's own RLS, so circles_access_restrictive decides. A listed Circle's rows still read
-- for anon (the lead funnel, ADR-1015) and a hidden Circle's rows are simply absent, exactly as
-- the Circle itself is. The predicate names no caller identity itself, so the table's verdict in
-- scripts/table-grants.txt stays `public`.
--
-- The service role writes and reads the table as before: RLS does not bind it.
--
-- PROOF: supabase/tests/circle_channels_visibility.test.sql.
--
-- ROLLBACK:
--   drop policy if exists "circle_channels: visible circles" on public.circle_channels;
--   create policy "circle_channels: public read" on public.circle_channels for select using (true);
-- =============================================================================

drop policy if exists "circle_channels: public read" on public.circle_channels;
drop policy if exists "circle_channels: visible circles" on public.circle_channels;
create policy "circle_channels: visible circles"
  on public.circle_channels
  for select
  using (exists (select 1 from public.circles c where c.id = circle_id));

comment on policy "circle_channels: visible circles" on public.circle_channels is
  'A row reads only when the caller can see its Circle under circles_access_restrictive (ADR-1015), so a hidden Circle''s ids and Channels never leak through the join (SCAN-651).';
