-- pgTAP for validate_collective_partner's ten-partner cap (migration 20270346010000, SCAN-1010).
-- The TypeScript invite counts first; only this file pins that the eleventh live row is refused
-- at commit, that declined and revoked free a slot, and that a second hub is not blocked.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a010-000000000001', 'hub-cap@test.local'),
  ('00000000-0000-4000-a010-000000000002', 'partner-cap@test.local');
delete from public.profiles
 where auth_user_id in ('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b010-000000000001', '00000000-0000-4000-a010-000000000001', 'Hub Cap', 'hub-cap', true),
  ('00000000-0000-4000-b010-000000000002', '00000000-0000-4000-a010-000000000002', 'Partner Cap', 'partner-cap', true);
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- Two Collective hubs and twelve partner Spaces owned by someone else.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan)
select ('00000000-0000-4000-c010-' || lpad(n::text, 12, '0'))::uuid,
  'partner-cap-' || n, 'Partner cap ' || n, 'business',
  (select id from public.entities where key = 'labs' limit 1),
  case when n in (0, 100) then '00000000-0000-4000-b010-000000000001'::uuid
       else '00000000-0000-4000-b010-000000000002'::uuid end,
  'active', 'network',
  case when n in (0, 100) then 'collective' else 'free' end
from generate_series(0, 12) n
union all
select '00000000-0000-4000-c010-000000000100',
  'partner-cap-other-hub', 'Partner cap other hub', 'business',
  (select id from public.entities where key = 'labs' limit 1),
  '00000000-0000-4000-b010-000000000001', 'active', 'network', 'collective';

insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
select '00000000-0000-4000-c010-000000000000',
       ('00000000-0000-4000-c010-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-4000-b010-000000000001',
       'pending'
from generate_series(1, 10) n;

select is(
  (select count(*)::int from public.collective_partners
    where hub_space_id = '00000000-0000-4000-c010-000000000000'
      and status in ('pending', 'accepted')),
  10,
  'ten pending invites land'
);

select throws_ok(
  $$ insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
     values ('00000000-0000-4000-c010-000000000000',
             '00000000-0000-4000-c010-000000000011',
             '00000000-0000-4000-b010-000000000001',
             'pending') $$,
  'P0001',
  'A Collective links up to 10 partner Spaces.',
  'an eleventh pending invite is refused'
);

select lives_ok(
  $$ insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
     values ('00000000-0000-4000-c010-000000000100',
             '00000000-0000-4000-c010-000000000011',
             '00000000-0000-4000-b010-000000000001',
             'pending') $$,
  'a second hub is not blocked by the first hub''s ten'
);

update public.collective_partners
   set status = 'declined'
 where hub_space_id = '00000000-0000-4000-c010-000000000000'
   and partner_space_id = '00000000-0000-4000-c010-000000000001';

select lives_ok(
  $$ insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
     values ('00000000-0000-4000-c010-000000000000',
             '00000000-0000-4000-c010-000000000012',
             '00000000-0000-4000-b010-000000000001',
             'pending') $$,
  'declining one invite frees a slot'
);

select throws_ok(
  $$ insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
     values ('00000000-0000-4000-c010-000000000000',
             '00000000-0000-4000-c010-000000000001',
             '00000000-0000-4000-b010-000000000001',
             'pending') $$,
  'P0001',
  'A Collective links up to 10 partner Spaces.',
  'the slot that just filled refuses the next invite'
);

select throws_ok(
  $$ update public.collective_partners
        set status = 'pending'
      where hub_space_id = '00000000-0000-4000-c010-000000000000'
        and partner_space_id = '00000000-0000-4000-c010-000000000001'
        and status = 'declined' $$,
  'P0001',
  'A Collective links up to 10 partner Spaces.',
  'bringing a declined row back to pending at cap is refused'
);

update public.collective_partners
   set status = 'revoked'
 where hub_space_id = '00000000-0000-4000-c010-000000000000'
   and partner_space_id = '00000000-0000-4000-c010-000000000002';

select lives_ok(
  $$ insert into public.collective_partners (hub_space_id, partner_space_id, invited_by, status)
     values ('00000000-0000-4000-c010-000000000000',
             '00000000-0000-4000-c010-000000000001',
             '00000000-0000-4000-b010-000000000001',
             'pending') $$,
  'revoking one invite also frees a slot'
);

select is(
  (select count(*)::int from public.collective_partners
    where hub_space_id = '00000000-0000-4000-c010-000000000000'
      and status in ('pending', 'accepted')),
  10,
  'the hub is back at ten live partners, never eleven'
);

select * from finish();
rollback;
