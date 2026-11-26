-- HYG-251: crm_tasks carries a deal link and a completion stamp, and no task is left in crm_activities.
begin;
select plan(4);

select has_column('public', 'crm_tasks', 'deal_id', 'crm_tasks.deal_id exists');
select has_column('public', 'crm_tasks', 'completed_at', 'crm_tasks.completed_at exists');
select has_index('public', 'crm_tasks', 'crm_tasks_deal_idx', 'crm_tasks has a deal index');
select is(
  (select count(*)::int from public.crm_activities where kind = 'task'),
  0,
  'no task rows remain in crm_activities'
);

select * from finish();
rollback;
