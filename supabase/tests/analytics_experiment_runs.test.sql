-- LIVE-2307: pilot re-runs, paused clock, guardrail review after follow-up, purge-proof results.
-- now() is fixed inside one transaction, so elapsed time is simulated by moving timestamps back.
-- Transaction rolls back.
begin;
select plan(21);
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-4000-e307-000000000001','experiment2307@test.local',now());
select set_config('test.experiment.person',(select id::text from public.profiles where auth_user_id='00000000-0000-4000-e307-000000000001'),true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.experiment.run1',public.analytics_experiment_manage('upcoming-next-step','draft',current_setting('test.experiment.person')::uuid)::text,true);
select public.analytics_experiment_manage('upcoming-next-step','start',current_setting('test.experiment.person')::uuid);

-- Pause five days into a seven-day window, then stay paused for ten days.
update public.analytics_experiments set started_at=now()-interval '5 days' where id=current_setting('test.experiment.run1')::uuid;
select public.analytics_experiment_manage('upcoming-next-step','pause',current_setting('test.experiment.person')::uuid);
select is((select paused_at from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),now(),'a pause inside the window starts the paused clock');
update public.analytics_experiments set started_at=started_at-interval '10 days',paused_at=paused_at-interval '10 days' where id=current_setting('test.experiment.run1')::uuid;
select throws_ok($q$select public.analytics_experiment_manage('upcoming-next-step','finish',current_setting('test.experiment.person')::uuid)$q$,'P0001','minimum enrollment period incomplete','a paused pilot cannot be closed on the old deadline');
select public.analytics_experiment_manage('upcoming-next-step','start',current_setting('test.experiment.person')::uuid);
select is((select paused_for from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),interval '10 days','resuming banks the paused time');
select is((public.analytics_experiment_assign('upcoming-next-step',current_setting('test.experiment.person')::uuid)->>'id')::uuid,current_setting('test.experiment.run1')::uuid,'a resumed pilot keeps its remaining enrollment days');
select public.analytics_experiment_expose(current_setting('test.experiment.run1')::uuid,current_setting('test.experiment.person')::uuid);
select public.analytics_experiment_outcome('event.rsvp',current_setting('test.experiment.person')::uuid);
select ok((select converted_at is not null from public.analytics_experiment_assignments where experiment_id=current_setting('test.experiment.run1')::uuid),'exposure and outcome count inside the extended window');
select throws_ok($q$select public.analytics_experiment_manage('upcoming-next-step','finish',current_setting('test.experiment.person')::uuid)$q$,'P0001','minimum enrollment period incomplete','the remaining two days must still run');

-- Three days later the extended window (7 + 10 paused days) is over.
update public.analytics_experiments set started_at=started_at-interval '3 days' where id=current_setting('test.experiment.run1')::uuid;
update public.analytics_experiment_assignments set assigned_at=assigned_at-interval '3 days',exposed_at=exposed_at-interval '3 days',converted_at=converted_at-interval '3 days' where experiment_id=current_setting('test.experiment.run1')::uuid;
select public.analytics_experiment_manage('upcoming-next-step','finish',current_setting('test.experiment.person')::uuid);
select is((select finished_at-started_at from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),interval '17 days','enrollment closes after seven running days plus the paused time');
select is((select guardrails_reviewed_at from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),null::timestamptz,'closing enrollment does not record a guardrail review');
select throws_ok($q$select public.analytics_experiment_manage('upcoming-next-step','review_guardrails',current_setting('test.experiment.person')::uuid)$q$,'P0001','guardrail follow-up incomplete','guardrail review is refused before the follow-up ends');
select throws_ok($q$select public.analytics_experiment_manage('upcoming-next-step','draft',current_setting('test.experiment.person')::uuid)$q$,'P0001','guardrail review missing','an unreviewed run cannot be re-drafted');

-- Seven more days: follow-up is over and the review is recorded with a frozen result.
update public.analytics_experiments set started_at=started_at-interval '7 days',finished_at=finished_at-interval '7 days' where id=current_setting('test.experiment.run1')::uuid;
update public.analytics_experiment_assignments set assigned_at=assigned_at-interval '7 days',exposed_at=exposed_at-interval '7 days',converted_at=converted_at-interval '7 days' where experiment_id=current_setting('test.experiment.run1')::uuid;
select public.analytics_experiment_manage('upcoming-next-step','review_guardrails',current_setting('test.experiment.person')::uuid);
select is((select guardrails_reviewed_at from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),now(),'guardrail review is recorded after follow-up');
select ok((select results_snapshot is not null from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),'the review freezes the per-arm totals');
select set_config('test.experiment.result',(public.analytics_experiment_results()->0)::text,true);
select is((current_setting('test.experiment.result')::jsonb->'control'->>'converted')::int+(current_setting('test.experiment.result')::jsonb->'treatment'->>'converted')::int,1,'the frozen result holds the measured conversion');

-- Retention deletes the membership; the completed result does not move.
update public.analytics_experiment_assignments set assigned_at=now()-interval '181 days' where experiment_id=current_setting('test.experiment.run1')::uuid;
select is(public.analytics_experiment_purge(now()-interval '180 days'),1::bigint,'old membership of a completed run is purged');
select is((select control_excluded+treatment_excluded from public.analytics_experiments where id=current_setting('test.experiment.run1')::uuid),1::bigint,'the exclusion trigger still counts the deletion');
select is(public.analytics_experiment_results()->0,current_setting('test.experiment.result')::jsonb,'a purge leaves a completed result unchanged');

-- The reviewed pilot is re-drafted as run 2, with its own ID and assignments.
select set_config('test.experiment.run2',public.analytics_experiment_manage('upcoming-next-step','draft',current_setting('test.experiment.person')::uuid)::text,true);
select isnt(current_setting('test.experiment.run2')::uuid,current_setting('test.experiment.run1')::uuid,'a completed pilot can be re-run as a new run');
select is((select run from public.analytics_experiments where id=current_setting('test.experiment.run2')::uuid),2,'the new run is numbered after the old one');
select is(public.analytics_experiment_manage('upcoming-next-step','draft',current_setting('test.experiment.person')::uuid),current_setting('test.experiment.run2')::uuid,'drafting again while a run is open is a no-op');
select public.analytics_experiment_manage('upcoming-next-step','start',current_setting('test.experiment.person')::uuid);
select is((public.analytics_experiment_assign('upcoming-next-step',current_setting('test.experiment.person')::uuid)->>'id')::uuid,current_setting('test.experiment.run2')::uuid,'the new run assigns into its own run');
select is(public.analytics_experiment_results()->0,current_setting('test.experiment.result')::jsonb,'the earlier run and its result stay as history');
select * from finish();
rollback;
