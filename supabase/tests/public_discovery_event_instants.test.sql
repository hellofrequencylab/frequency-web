-- Actual-schema pgTAP regression. Disposable migrated database only; all fixtures roll back.
-- Timestamps are stored host wall-clock UTC parts, not true instants.
begin;
select plan(37);
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility,preferences) values
 ('00000000-0000-4000-e246-000000000001','instant-visible','Instant visible','business',(select id from public.entities where key='labs' limit 1),'active','network','{}'),
 ('00000000-0000-4000-e246-000000000002','instant-private','Instant private','business',(select id from public.entities where key='labs' limit 1),'active','private','{}'),
 ('00000000-0000-4000-e246-000000000003','instant-inactive','Instant inactive','business',(select id from public.entities where key='labs' limit 1),'archived','network','{}');
insert into public.profiles(id,display_name,handle) values ('00000000-0000-4000-e246-000000000010','Instant host','instant-host');
-- Derive stored parts from fixed offsets around the transaction's real now().
insert into public.events(id,title,slug,scope_type,scope_id,space_id,host_id,visibility,status,starts_at,time_zone,city,location,region,hide_address,is_cancelled,is_demo,join_mode)
select ('00000000-0000-4000-e246-'||lpad(n::text,12,'0'))::uuid,'Instant '||n,'instant-'||n,'public','00000000-0000-4000-e246-000000000099',
 '00000000-0000-4000-e246-000000000001','00000000-0000-4000-e246-000000000010','public','published',
 ((now()+delta) at time zone zone) at time zone 'UTC',zone,'Instantville','123 Secret Street','CA',true,false,false,'rsvp'
from (values (101,interval '1 second','America/Los_Angeles'),(102,interval '-1 hour','Pacific/Auckland'),
 (103,interval '2 seconds','Pacific/Auckland'),(104,interval '3 seconds','America/Los_Angeles'),
 (105,interval '4 seconds','America/Los_Angeles'),(106,interval '5 seconds','America/Los_Angeles'),
 (107,interval '-23 hours','America/Los_Angeles'),(108,interval '-25 hours','America/Los_Angeles'),
 (109,interval '6 seconds','America/Los_Angeles'),(110,interval '7 seconds','America/Los_Angeles'),
 (111,interval '8 seconds','America/Los_Angeles'),(112,interval '9 seconds','America/Los_Angeles'),
 (113,interval '10 seconds','America/Los_Angeles'),(114,interval '11 seconds','America/Los_Angeles'),
 (115,interval '12 seconds','America/Los_Angeles')) v(n,delta,zone);
update public.events set time_zone='not/a_zone' where slug='instant-104';
update public.events set time_zone='aMeRiCa/LoS_aNgElEs' where slug='instant-106';
update public.events set status='draft' where slug='instant-109';
update public.events set visibility='private' where slug='instant-110';
update public.events set removed_at=now(),removed_reason='test' where slug='instant-111';
update public.events set is_cancelled=true where slug='instant-112';
update public.events set is_demo=true where slug='instant-113';
update public.events set space_id='00000000-0000-4000-e246-000000000002' where slug='instant-114';
update public.events set space_id='00000000-0000-4000-e246-000000000003' where slug='instant-115';
select is((select count(*)::int from public.public_events(200) where slug='instant-101'),1,'Pacific future with raw past remains listed');
select is((select count(*)::int from public.public_events(200) where slug='instant-102'),0,'Auckland past with raw future is excluded');
select is((select time_zone from public.public_events(200) where slug='instant-104'),'America/Los_Angeles','invalid zone falls back HOME');
update public.events set time_zone='' where slug='instant-104';
select is((select time_zone from public.public_events(200) where slug='instant-104'),'America/Los_Angeles','blank zone falls back HOME');
select is(coalesce((select name from pg_catalog.pg_timezone_names where lower(name)=lower(null::text) limit 1),'America/Los_Angeles'),'America/Los_Angeles','null zone resolver falls back HOME (event column is NOT NULL)');
select is((select time_zone from public.public_events(200) where slug='instant-106'),'America/Los_Angeles','zone case normalizes');
select is((select count(*)::int from public.public_events(200) where slug in ('instant-109','instant-110','instant-111','instant-112','instant-113','instant-114','instant-115')),0,'publication privacy removal cancellation demo and Space walls remain');
select is((select upcoming_events from public.density_by_city() where city='Instantville'),5::bigint,'density matches five future discover fixtures');
select is((select count(*)::int from public.public_calendar_feed() where slug='instant-107'),1,'calendar retains23hour lookback');
select is((select count(*)::int from public.public_calendar_feed() where slug='instant-108'),0,'calendar excludes25hour lookback');
select is((select location from public.public_calendar_feed() where slug='instant-101'),'Instantville, CA','public calendar hides street');
select is((select location from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000001') where slug='instant-101'),'Instantville, CA','Space calendar hides street');
select is((select count(*)::int from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000002')),0,'private target calendar empty');
select is((select count(*)::int from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000003')),0,'inactive target calendar empty');
select is((select is_past from public.public_organizer_events('instant-host') where slug='instant-101'),false,'organizer uses host instant for future');
select is((select is_past from public.public_organizer_events('instant-host') where slug='instant-102'),true,'organizer uses host instant for past');
select ok((select array_position(array_agg(slug),'instant-101') < array_position(array_agg(slug),'instant-103') from public.public_events(200)),'discovery mixed zones order by instant');
select ok((select array_position(array_agg(slug),'instant-101') < array_position(array_agg(slug),'instant-103') from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000001')),'Space UNION mixed zones order by instant');
select ok((select count(*) <= 200 from public.public_events(999)),'listing limit is bounded');
select is(has_function_privilege('anon','public.public_events(integer)','execute'),true,'anon discovery grant retained');
select is(has_function_privilege('anon','public.public_organizer_events(text)','execute'),true,'anon organizer grant retained');
select is(has_function_privilege('anon','public.public_calendar_feed()','execute'),false,'public calendar service only');
select is(has_function_privilege('authenticated','public.space_public_calendar_feed(uuid)','execute'),false,'Space calendar service only');
select is(has_function_privilege('anon','public.event_calendar_feed(text)','execute'),false,'token feed service only');
select is(has_function_privilege('anon','public.density_by_city()','execute'),false,'density service only');
select is(('2026-03-08 02:30:00'::timestamp at time zone 'America/Los_Angeles'),'2026-03-08 10:30:00+00'::timestamptz,'PostgreSQL gap advances skipped hour');
select is(('2026-11-01 01:30:00'::timestamp at time zone 'America/Los_Angeles'),'2026-11-01 09:30:00+00'::timestamptz,'PostgreSQL fold selects later occurrence');
select ok(pg_get_function_result('public.public_events(integer)'::regprocedure) !~* '(street|postal_code|venue_name|geog|location)','discovery return remains city-only');
-- Token is an admission credential; a pending RSVP must not reveal the venue.
insert into public.event_calendar_follows(profile_id,token) values ('00000000-0000-4000-e246-000000000010','instant-token-246');
insert into public.event_rsvps(profile_id,event_id,status,approval_status) values
 ('00000000-0000-4000-e246-000000000010','00000000-0000-4000-e246-000000000101','going','approved'),
 ('00000000-0000-4000-e246-000000000010','00000000-0000-4000-e246-000000000103','going','pending');
select is((select count(*)::int from public.event_calendar_feed('instant-token-246') where slug='instant-101'),1,'admitted token event remains');
select is((select count(*)::int from public.event_calendar_feed('instant-token-246') where slug='instant-103'),0,'pending RSVP never grants token feed venue');
select is((select count(*)::int from public.event_calendar_feed('incorrect-token')),0,'wrong token returns no events');
select is((select location from public.event_calendar_feed('instant-token-246') where slug='instant-101'),'123 Secret Street','admitted token retains permitted venue');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility,preferences) values
 ('00000000-0000-4000-e246-000000000004','instant-shared','Instant shared','business',(select id from public.entities where key='labs' limit 1),'active','network','{}');
insert into public.event_space_shares(space_id,event_id,requested_by,status) values
 ('00000000-0000-4000-e246-000000000004','00000000-0000-4000-e246-000000000101','00000000-0000-4000-e246-000000000010','accepted'),
 ('00000000-0000-4000-e246-000000000004','00000000-0000-4000-e246-000000000103','00000000-0000-4000-e246-000000000010','pending'),
 ('00000000-0000-4000-e246-000000000004','00000000-0000-4000-e246-000000000110','00000000-0000-4000-e246-000000000010','accepted');
select is((select count(*)::int from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000004') where slug='instant-101'),1,'accepted share carries eligible event');
select is((select count(*)::int from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000004') where slug='instant-103'),0,'pending share never carries event');
select is((select count(*)::int from public.space_public_calendar_feed('00000000-0000-4000-e246-000000000004') where slug='instant-110'),0,'accepted share never bypasses private event gate');
-- Exercise the bound with more rows than it can return, not an empty-fixture inequality.
insert into public.events(id,title,slug,scope_type,scope_id,space_id,visibility,status,starts_at,time_zone,is_cancelled,is_demo,join_mode)
select ('00000000-0000-4000-e246-'||lpad((1000+n)::text,12,'0'))::uuid,'Limit fixture','instant-limit-'||n,'public','00000000-0000-4000-e246-000000000099',
 '00000000-0000-4000-e246-000000000001','public','published',now()+interval '30 days'+n*interval '1 minute','UTC',false,false,'rsvp'
from generate_series(1,205) n;
select is((select count(*)::int from public.public_events(999)),200,'large listing request returns exactly capped200');
select is((select count(*)::int from public.public_events(0)),1,'zero listing request retains minimum1');
select * from finish();
rollback;
