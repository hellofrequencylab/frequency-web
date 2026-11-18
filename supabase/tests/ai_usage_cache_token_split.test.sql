-- PROG-E8 4b: the prompt-cache split on ai_usage (migration 20270346130000).
-- The six-argument settle stores the split, the four-argument settle still works and leaves it
-- NULL, replays compare the split, bad splits are refused, ai_tokens_today sums it, members
-- cannot reach either. Local/CI database only; every fixture and switch change rolls back.
begin;
select plan(14);
insert into public.profiles(id,display_name,handle,is_active)
values ('00000000-0000-4000-b8e8-000000000001','Token split fixture','token-split-fixture-e8',true);
update public.platform_flags set value=true where key='ai_enabled';
create function pg_temp.reserve_attempt(n integer)
returns boolean language sql as $$
 select public.ai_reserve_attempt(('00000000-0000-4000-a8e8-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-4000-a8e8-000000000099','vera-chat','fixture-model',0.01,
 '00000000-0000-4000-b8e8-000000000001',null,25,2,0.5);
$$;

select has_column('public','ai_usage','cache_read_input_tokens','cache read column exists');
select has_column('public','ai_usage','cache_creation_input_tokens','cache write column exists');
select col_is_null('public','ai_usage','cache_read_input_tokens','cache read is nullable (old writers keep working)');

select ok(pg_temp.reserve_attempt(1),'first attempt reserves');
select ok(public.ai_settle_attempt('00000000-0000-4000-a8e8-000000000001',2550,9,0.01,2400,50),'six-argument settle writes the split');
select results_eq(
  $$select input_tokens,cache_read_input_tokens,cache_creation_input_tokens from public.ai_usage where reservation_id='00000000-0000-4000-a8e8-000000000001'$$,
  $$values (2550,2400,50)$$,'input_tokens stays the whole prompt; the split sits beside it');
select ok(public.ai_settle_attempt('00000000-0000-4000-a8e8-000000000001',2550,9,0.01,2400,50),'identical split replay is safe');
select ok(not public.ai_settle_attempt('00000000-0000-4000-a8e8-000000000001',2550,9,0.01,2000,50),'replay with a different split is refused');

select ok(pg_temp.reserve_attempt(2),'second attempt reserves');
select throws_ok($$select public.ai_settle_attempt('00000000-0000-4000-a8e8-000000000002',100,9,0.01,90,20)$$,
  'P0001','Invalid AI usage','a split larger than the whole prompt is refused');
select ok(public.ai_settle_attempt('00000000-0000-4000-a8e8-000000000002',100,9,0.01),'four-argument settle still works');
select is((select cache_read_input_tokens from public.ai_usage where reservation_id='00000000-0000-4000-a8e8-000000000002'),
  null::integer,'four-argument settle leaves the split not recorded');

select results_eq(
  $$select prompt_tokens,cache_read_tokens,cache_creation_tokens,split_rows,unsplit_rows from public.ai_tokens_today()
    where feature='vera-chat' and prompt_tokens >= 2650$$,
  $$select (coalesce(sum(input_tokens),0))::bigint,(coalesce(sum(cache_read_input_tokens),0))::bigint,
      (coalesce(sum(cache_creation_input_tokens),0))::bigint,
      count(*) filter (where cache_read_input_tokens is not null and cache_creation_input_tokens is not null),
      count(*) filter (where cache_read_input_tokens is null or cache_creation_input_tokens is null)
    from public.ai_usage where feature='vera-chat' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'$$,
  'ai_tokens_today sums today''s split per feature');

set local role authenticated;
select throws_ok($$select public.ai_tokens_today()$$,'42501',null,'members cannot read the token split');
reset role;
select * from finish();
rollback;
