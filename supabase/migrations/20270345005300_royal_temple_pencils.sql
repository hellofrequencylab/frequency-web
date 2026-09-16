-- ROYAL TEMPLE'S 2026 TO 2027 SEASON, PENCILLED IN (ADR-1385, docs/EVENTS-CALENDAR.md "The private layer").
--
-- WHY. Royal Temple (slug `royaltemple`, Vista, California) planned its year from the Fall Equinox
-- 2026 through the Fall Equinox 2027 and handed the owner a dated month-by-month schedule. None of it
-- is published yet, and most of it should not be until each night has a host and a page. The private
-- calendar layer (20270345005200_private_calendar_layer.sql) has a kind for exactly that: a PENCIL,
-- a tentative date the team can see and move, which is never an event and never public. Loading the
-- season as pencils means the team opens its calendar and sees the year it planned, and turns each
-- pencil into a Production when it is ready.
--
-- WHAT IS HERE.
--   1. 154 pencil rows transcribed from the owner's dated tables (not regenerated from the repeat
--      rules; the tables carry exceptions the rules do not). Per series: Community Dinner 46, Meld 26,
--      Craft Night 24, Circles Night 21, Ecstatic Dance 12, Concert 10, Moon Circle 9, and 6 seasonal
--      rows (Equinox Opening Circle, Fall Soft Opening, Winter Bazaar, Spring Feast, Summer Festival,
--      Fall Campout). 129 distinct local start dates.
--   2. Three weekly DAY NOTES, public, for the season: Quiet hours (Monday), Flex day (Thursday),
--      Retreat & rental (Friday and Saturday).
--
-- THE OWNER'S NOTES, HONORED ROW BY ROW.
--   - Dark dates are simply absent: Nov 22, 24, 25, 29 (Thanksgiving); Dec 20, 22, 23, 27, 29, 30;
--     Mar 21; Jun 20; Sep 26 2027 as a Sunday Dinner (the Fall Campout runs through that morning).
--   - Nov 18, Apr 21 and May 19 carry two rows each: Meld in the day, Moon Circle in the evening.
--   - Meld runs every 14 days from Sep 23 2026 but skips Dec 30, so Dec 16 to Jan 13 is 28 days.
--   - December has no Moon Circle and no Concert. November's Concert is Sun Nov 15.
--   - Summer Festival is ONE row, Fri Jun 18 2027 4:00 PM through Sun Jun 20 12:00 PM.
--   - Fall Campout is ONE row, Fri Sep 24 2027 3:00 PM through Sun Sep 26 12:00 PM.
--
-- TIME. Wall clock stored as UTC parts, read in `time_zone` (lib/time/zone.ts), exactly as events do.
-- '2026-09-22T19:00:00Z' with time_zone 'America/Los_Angeles' is 7:00 PM in Vista. Do NOT convert.
--
-- ALREADY PRODUCTIONS (checked 2026-09-16, read-only against production). Published, not removed
-- events on or after 2026-09-01 where the Space is `royaltemple` (space_id or host_space_id):
--   Meld - Community Cowork        2026-09-02, 2026-09-09, 2026-09-16
--   Co Creating What's Next        2026-09-02
--   Royal Reset Friday Float       2026-09-11
--   Returning Home, A Sacred Embodiment Experience   2026-10-23
-- Every one of them falls before the season opens (Sep 22) or on a date with no schedule row of the
-- same name, so NO schedule row matched a published event and NOTHING was skipped. If a Production
-- is published for one of these dates later, the pencil stays on the private layer until the team
-- clears it; the two layers never write to each other.
--
-- IDEMPOTENT (SAFE to re-run). The Space is resolved by slug; if no Space has slug `royaltemple`
-- (a local or preview database), nothing is inserted. The pencils go in as one set, only if no entry
-- for the Space already carries metadata->>'seed' = 'royal-temple-2026-27', so a re-run never doubles
-- them and a pencil the team deleted is not resurrected by a partial re-insert. Each day note goes in
-- only if the Space has no day note with that label.
--
-- ROLLBACK:
--   delete from public.space_calendar_entries
--    where space_id = (select id from public.spaces where slug = 'royaltemple')
--      and metadata->>'seed' = 'royal-temple-2026-27';
--   delete from public.space_calendar_day_notes
--    where space_id = (select id from public.spaces where slug = 'royaltemple')
--      and label in ('Quiet hours', 'Flex day', 'Retreat & rental');

do $$
declare
  v_space uuid;
  v_seed  constant text := 'royal-temple-2026-27';
begin
  select id into v_space from public.spaces where slug = 'royaltemple' limit 1;
  if v_space is null then
    raise notice 'royal temple pencils: no space with slug royaltemple, nothing inserted';
    return;
  end if;

  if not exists (
    select 1 from public.space_calendar_entries
     where space_id = v_space and metadata->>'seed' = v_seed
  ) then
    insert into public.space_calendar_entries (
      space_id, kind, title, all_day, starts_at, ends_at, time_zone,
      status, blocks_time, visibility, metadata
    )
    select v_space, 'pencil', s.title, false, s.starts_at::timestamptz, s.ends_at::timestamptz,
           'America/Los_Angeles', 'tentative', false, 'team',
           jsonb_build_object('seed', v_seed, 'series', s.title)
      from (values
      -- 2026-09
      ('Equinox Opening Circle', '2026-09-22T19:00:00Z', '2026-09-22T21:00:00Z'),  -- Tue
      ('Meld', '2026-09-23T10:00:00Z', '2026-09-23T17:00:00Z'),  -- Wed
      ('Fall Soft Opening', '2026-09-25T18:00:00Z', '2026-09-25T22:00:00Z'),  -- Fri
      ('Community Dinner', '2026-09-27T17:00:00Z', '2026-09-27T19:00:00Z'),  -- Sun
      -- 2026-10
      ('Community Dinner', '2026-10-04T17:00:00Z', '2026-10-04T19:00:00Z'),  -- Sun
      ('Craft Night', '2026-10-06T18:00:00Z', '2026-10-06T21:00:00Z'),  -- Tue
      ('Meld', '2026-10-07T10:00:00Z', '2026-10-07T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2026-10-11T15:00:00Z', '2026-10-11T17:00:00Z'),  -- Sun
      ('Community Dinner', '2026-10-11T17:00:00Z', '2026-10-11T19:00:00Z'),  -- Sun
      ('Circles Night', '2026-10-13T18:00:00Z', '2026-10-13T21:00:00Z'),  -- Tue
      ('Community Dinner', '2026-10-18T17:00:00Z', '2026-10-18T19:00:00Z'),  -- Sun
      ('Craft Night', '2026-10-20T18:00:00Z', '2026-10-20T21:00:00Z'),  -- Tue
      ('Meld', '2026-10-21T10:00:00Z', '2026-10-21T17:00:00Z'),  -- Wed
      ('Community Dinner', '2026-10-25T17:00:00Z', '2026-10-25T19:00:00Z'),  -- Sun
      ('Concert', '2026-10-25T19:00:00Z', '2026-10-25T21:00:00Z'),  -- Sun
      ('Circles Night', '2026-10-27T18:00:00Z', '2026-10-27T21:00:00Z'),  -- Tue
      ('Moon Circle', '2026-10-28T19:00:00Z', '2026-10-28T21:00:00Z'),  -- Wed
      -- 2026-11
      ('Community Dinner', '2026-11-01T17:00:00Z', '2026-11-01T19:00:00Z'),  -- Sun
      ('Craft Night', '2026-11-03T18:00:00Z', '2026-11-03T21:00:00Z'),  -- Tue
      ('Meld', '2026-11-04T10:00:00Z', '2026-11-04T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2026-11-08T15:00:00Z', '2026-11-08T17:00:00Z'),  -- Sun
      ('Community Dinner', '2026-11-08T17:00:00Z', '2026-11-08T19:00:00Z'),  -- Sun
      ('Circles Night', '2026-11-10T18:00:00Z', '2026-11-10T21:00:00Z'),  -- Tue
      ('Community Dinner', '2026-11-15T17:00:00Z', '2026-11-15T19:00:00Z'),  -- Sun
      ('Concert', '2026-11-15T19:00:00Z', '2026-11-15T21:00:00Z'),  -- Sun
      ('Craft Night', '2026-11-17T18:00:00Z', '2026-11-17T21:00:00Z'),  -- Tue
      ('Meld', '2026-11-18T10:00:00Z', '2026-11-18T17:00:00Z'),  -- Wed
      ('Moon Circle', '2026-11-18T19:00:00Z', '2026-11-18T21:00:00Z'),  -- Wed
      -- 2026-12
      ('Craft Night', '2026-12-01T18:00:00Z', '2026-12-01T21:00:00Z'),  -- Tue
      ('Meld', '2026-12-02T10:00:00Z', '2026-12-02T17:00:00Z'),  -- Wed
      ('Community Dinner', '2026-12-06T17:00:00Z', '2026-12-06T19:00:00Z'),  -- Sun
      ('Circles Night', '2026-12-08T18:00:00Z', '2026-12-08T21:00:00Z'),  -- Tue
      ('Ecstatic Dance', '2026-12-13T15:00:00Z', '2026-12-13T17:00:00Z'),  -- Sun
      ('Community Dinner', '2026-12-13T17:00:00Z', '2026-12-13T19:00:00Z'),  -- Sun
      ('Craft Night', '2026-12-15T18:00:00Z', '2026-12-15T21:00:00Z'),  -- Tue
      ('Meld', '2026-12-16T10:00:00Z', '2026-12-16T17:00:00Z'),  -- Wed
      ('Winter Bazaar', '2026-12-19T11:00:00Z', '2026-12-19T20:00:00Z'),  -- Sat
      -- 2027-01
      ('Community Dinner', '2027-01-03T17:00:00Z', '2027-01-03T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-01-05T18:00:00Z', '2027-01-05T21:00:00Z'),  -- Tue
      ('Ecstatic Dance', '2027-01-10T15:00:00Z', '2027-01-10T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-01-10T17:00:00Z', '2027-01-10T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-01-12T18:00:00Z', '2027-01-12T21:00:00Z'),  -- Tue
      ('Meld', '2027-01-13T10:00:00Z', '2027-01-13T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-01-17T17:00:00Z', '2027-01-17T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-01-19T18:00:00Z', '2027-01-19T21:00:00Z'),  -- Tue
      ('Moon Circle', '2027-01-20T19:00:00Z', '2027-01-20T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-01-24T17:00:00Z', '2027-01-24T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-01-26T18:00:00Z', '2027-01-26T21:00:00Z'),  -- Tue
      ('Meld', '2027-01-27T10:00:00Z', '2027-01-27T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-01-31T17:00:00Z', '2027-01-31T19:00:00Z'),  -- Sun
      ('Concert', '2027-01-31T19:00:00Z', '2027-01-31T21:00:00Z'),  -- Sun
      -- 2027-02
      ('Craft Night', '2027-02-02T18:00:00Z', '2027-02-02T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-02-07T17:00:00Z', '2027-02-07T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-02-09T18:00:00Z', '2027-02-09T21:00:00Z'),  -- Tue
      ('Meld', '2027-02-10T10:00:00Z', '2027-02-10T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2027-02-14T15:00:00Z', '2027-02-14T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-02-14T17:00:00Z', '2027-02-14T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-02-16T18:00:00Z', '2027-02-16T21:00:00Z'),  -- Tue
      ('Moon Circle', '2027-02-17T19:00:00Z', '2027-02-17T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-02-21T17:00:00Z', '2027-02-21T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-02-23T18:00:00Z', '2027-02-23T21:00:00Z'),  -- Tue
      ('Meld', '2027-02-24T10:00:00Z', '2027-02-24T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-02-28T17:00:00Z', '2027-02-28T19:00:00Z'),  -- Sun
      ('Concert', '2027-02-28T19:00:00Z', '2027-02-28T21:00:00Z'),  -- Sun
      -- 2027-03
      ('Craft Night', '2027-03-02T18:00:00Z', '2027-03-02T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-03-07T17:00:00Z', '2027-03-07T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-03-09T18:00:00Z', '2027-03-09T21:00:00Z'),  -- Tue
      ('Meld', '2027-03-10T10:00:00Z', '2027-03-10T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2027-03-14T15:00:00Z', '2027-03-14T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-03-14T17:00:00Z', '2027-03-14T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-03-16T18:00:00Z', '2027-03-16T21:00:00Z'),  -- Tue
      ('Spring Feast', '2027-03-20T14:00:00Z', '2027-03-20T21:00:00Z'),  -- Sat
      ('Circles Night', '2027-03-23T18:00:00Z', '2027-03-23T21:00:00Z'),  -- Tue
      ('Meld', '2027-03-24T10:00:00Z', '2027-03-24T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-03-28T17:00:00Z', '2027-03-28T19:00:00Z'),  -- Sun
      ('Concert', '2027-03-28T19:00:00Z', '2027-03-28T21:00:00Z'),  -- Sun
      -- 2027-04
      ('Community Dinner', '2027-04-04T17:00:00Z', '2027-04-04T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-04-06T18:00:00Z', '2027-04-06T21:00:00Z'),  -- Tue
      ('Meld', '2027-04-07T10:00:00Z', '2027-04-07T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2027-04-11T15:00:00Z', '2027-04-11T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-04-11T17:00:00Z', '2027-04-11T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-04-13T18:00:00Z', '2027-04-13T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-04-18T17:00:00Z', '2027-04-18T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-04-20T18:00:00Z', '2027-04-20T21:00:00Z'),  -- Tue
      ('Meld', '2027-04-21T10:00:00Z', '2027-04-21T17:00:00Z'),  -- Wed
      ('Moon Circle', '2027-04-21T19:00:00Z', '2027-04-21T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-04-25T17:00:00Z', '2027-04-25T19:00:00Z'),  -- Sun
      ('Concert', '2027-04-25T19:00:00Z', '2027-04-25T21:00:00Z'),  -- Sun
      ('Circles Night', '2027-04-27T18:00:00Z', '2027-04-27T21:00:00Z'),  -- Tue
      -- 2027-05
      ('Community Dinner', '2027-05-02T17:00:00Z', '2027-05-02T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-05-04T18:00:00Z', '2027-05-04T21:00:00Z'),  -- Tue
      ('Meld', '2027-05-05T10:00:00Z', '2027-05-05T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2027-05-09T15:00:00Z', '2027-05-09T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-05-09T17:00:00Z', '2027-05-09T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-05-11T18:00:00Z', '2027-05-11T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-05-16T17:00:00Z', '2027-05-16T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-05-18T18:00:00Z', '2027-05-18T21:00:00Z'),  -- Tue
      ('Meld', '2027-05-19T10:00:00Z', '2027-05-19T17:00:00Z'),  -- Wed
      ('Moon Circle', '2027-05-19T19:00:00Z', '2027-05-19T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-05-23T17:00:00Z', '2027-05-23T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-05-25T18:00:00Z', '2027-05-25T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-05-30T17:00:00Z', '2027-05-30T19:00:00Z'),  -- Sun
      ('Concert', '2027-05-30T19:00:00Z', '2027-05-30T21:00:00Z'),  -- Sun
      -- 2027-06
      ('Craft Night', '2027-06-01T18:00:00Z', '2027-06-01T21:00:00Z'),  -- Tue
      ('Meld', '2027-06-02T10:00:00Z', '2027-06-02T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-06-06T17:00:00Z', '2027-06-06T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-06-08T18:00:00Z', '2027-06-08T21:00:00Z'),  -- Tue
      ('Ecstatic Dance', '2027-06-13T15:00:00Z', '2027-06-13T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-06-13T17:00:00Z', '2027-06-13T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-06-15T18:00:00Z', '2027-06-15T21:00:00Z'),  -- Tue
      ('Meld', '2027-06-16T10:00:00Z', '2027-06-16T17:00:00Z'),  -- Wed
      ('Summer Festival', '2027-06-18T16:00:00Z', '2027-06-20T12:00:00Z'),  -- Fri
      ('Circles Night', '2027-06-22T18:00:00Z', '2027-06-22T21:00:00Z'),  -- Tue
      ('Community Dinner', '2027-06-27T17:00:00Z', '2027-06-27T19:00:00Z'),  -- Sun
      ('Concert', '2027-06-27T19:00:00Z', '2027-06-27T21:00:00Z'),  -- Sun
      ('Meld', '2027-06-30T10:00:00Z', '2027-06-30T17:00:00Z'),  -- Wed
      -- 2027-07
      ('Community Dinner', '2027-07-04T17:00:00Z', '2027-07-04T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-07-06T18:00:00Z', '2027-07-06T21:00:00Z'),  -- Tue
      ('Ecstatic Dance', '2027-07-11T15:00:00Z', '2027-07-11T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-07-11T17:00:00Z', '2027-07-11T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-07-13T18:00:00Z', '2027-07-13T21:00:00Z'),  -- Tue
      ('Meld', '2027-07-14T10:00:00Z', '2027-07-14T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-07-18T17:00:00Z', '2027-07-18T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-07-20T18:00:00Z', '2027-07-20T21:00:00Z'),  -- Tue
      ('Moon Circle', '2027-07-21T19:00:00Z', '2027-07-21T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-07-25T17:00:00Z', '2027-07-25T19:00:00Z'),  -- Sun
      ('Concert', '2027-07-25T19:00:00Z', '2027-07-25T21:00:00Z'),  -- Sun
      ('Circles Night', '2027-07-27T18:00:00Z', '2027-07-27T21:00:00Z'),  -- Tue
      ('Meld', '2027-07-28T10:00:00Z', '2027-07-28T17:00:00Z'),  -- Wed
      -- 2027-08
      ('Community Dinner', '2027-08-01T17:00:00Z', '2027-08-01T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-08-03T18:00:00Z', '2027-08-03T21:00:00Z'),  -- Tue
      ('Ecstatic Dance', '2027-08-08T15:00:00Z', '2027-08-08T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-08-08T17:00:00Z', '2027-08-08T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-08-10T18:00:00Z', '2027-08-10T21:00:00Z'),  -- Tue
      ('Meld', '2027-08-11T10:00:00Z', '2027-08-11T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-08-15T17:00:00Z', '2027-08-15T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-08-17T18:00:00Z', '2027-08-17T21:00:00Z'),  -- Tue
      ('Moon Circle', '2027-08-18T19:00:00Z', '2027-08-18T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-08-22T17:00:00Z', '2027-08-22T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-08-24T18:00:00Z', '2027-08-24T21:00:00Z'),  -- Tue
      ('Meld', '2027-08-25T10:00:00Z', '2027-08-25T17:00:00Z'),  -- Wed
      ('Community Dinner', '2027-08-29T17:00:00Z', '2027-08-29T19:00:00Z'),  -- Sun
      ('Concert', '2027-08-29T19:00:00Z', '2027-08-29T21:00:00Z'),  -- Sun
      -- 2027-09
      ('Community Dinner', '2027-09-05T17:00:00Z', '2027-09-05T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-09-07T18:00:00Z', '2027-09-07T21:00:00Z'),  -- Tue
      ('Meld', '2027-09-08T10:00:00Z', '2027-09-08T17:00:00Z'),  -- Wed
      ('Ecstatic Dance', '2027-09-12T15:00:00Z', '2027-09-12T17:00:00Z'),  -- Sun
      ('Community Dinner', '2027-09-12T17:00:00Z', '2027-09-12T19:00:00Z'),  -- Sun
      ('Circles Night', '2027-09-14T18:00:00Z', '2027-09-14T21:00:00Z'),  -- Tue
      ('Moon Circle', '2027-09-15T19:00:00Z', '2027-09-15T21:00:00Z'),  -- Wed
      ('Community Dinner', '2027-09-19T17:00:00Z', '2027-09-19T19:00:00Z'),  -- Sun
      ('Craft Night', '2027-09-21T18:00:00Z', '2027-09-21T21:00:00Z'),  -- Tue
      ('Meld', '2027-09-22T10:00:00Z', '2027-09-22T17:00:00Z'),  -- Wed
      ('Fall Campout', '2027-09-24T15:00:00Z', '2027-09-26T12:00:00Z')   -- Fri
      ) as s(title, starts_at, ends_at);
  end if;

  insert into public.space_calendar_day_notes (space_id, label, weekdays, starts_on, ends_on, visibility, sort)
  select v_space, n.label, n.weekdays, date '2026-09-22', date '2027-09-26', 'public', n.sort
    from (values
      ('Quiet hours',      array[1]::smallint[],   0),
      ('Flex day',         array[4]::smallint[],   1),
      ('Retreat & rental', array[5, 6]::smallint[], 2)
    ) as n(label, weekdays, sort)
   where not exists (
     select 1 from public.space_calendar_day_notes d
      where d.space_id = v_space and d.label = n.label
   );
end
$$;
