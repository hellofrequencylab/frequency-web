-- ADR-304: Journeys ⇄ On Air integration — per-practice `uses_timer`.
--
-- `practices.uses_timer` is the per-practice discriminator for the SINGLE action a follower sees on
-- a Journey step: a timer practice (a sit, breathwork) shows "Practice" and opens the On Air timer;
-- a Log it practice (an action, a reflection) shows "Log it" and records in one tap. Defaults true
-- (most library practices are sits/breathwork). The 9 action/reflection practices are flipped false.
--
-- Recreate `practices_ranked` to expose uses_timer (appended LAST, the create-or-replace rule).

alter table public.practices
  add column if not exists uses_timer boolean not null default true;

comment on column public.practices.uses_timer is
  'Does this practice run the On Air timer (Practice) or just get logged (Log it)? Drives the single Journey-step action.';

-- The action/reflection practices that just want a one-tap log (not a timer).
update public.practices
  set uses_timer = false
  where slug in (
    'daily-walk', 'morning-movement', 'screen-free-morning', 'deep-listening',
    'act-of-service', 'one-small-reach', 'signal-journal', 'voice-journal', 'write-something'
  );

-- create-or-replace requires new columns appended at the END, so uses_timer comes after duration_min
-- (the prior last column). Same shape as before otherwise.
create or replace view public.practices_ranked as
  select
    p.id,
    p.title,
    p.description,
    p.created_by,
    p.is_public,
    p.created_at,
    p.is_demo,
    p.category,
    p.icon,
    p.summary,
    p.header_image,
    p.body,
    p.cadence,
    p.reward_zaps,
    p.reward_note,
    p.domain_id,
    p.status,
    p.reviewed_by,
    p.reviewed_at,
    p.subcategory_id,
    p.embedding,
    p.is_template,
    p.featured_at,
    p.weight_class,
    coalesce(a.adopters, 0::bigint) as adopters,
    coalesce(l.logs_30d, 0::bigint) as logs_30d,
    coalesce(l.logs_total, 0::bigint) as logs_total,
    coalesce(l.logs_30d, 0::bigint) * 3 + coalesce(a.adopters, 0::bigint) * 2 + coalesce(l.logs_total, 0::bigint) as score,
    p.focus_details,
    p.duration_min,
    p.uses_timer
  from practices p
    left join (
      select member_practices.practice_id, count(*) as adopters
      from member_practices
      where member_practices.active = true
      group by member_practices.practice_id
    ) a on a.practice_id = p.id
    left join (
      select practice_logs.practice_id,
        count(*) filter (where practice_logs.logged_for >= (current_date - 30)) as logs_30d,
        count(*) as logs_total
      from practice_logs
      group by practice_logs.practice_id
    ) l on l.practice_id = p.id;
