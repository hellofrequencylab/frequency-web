-- ADR-303: Quest practice library — practices valued by CADENCE.
--
-- Two parts:
--   1. A structured session length: `practices.duration_min` (the Notion "Duration (min)").
--      Cadence is FREQUENCY (how often); duration_min is LENGTH (how long). Nullable.
--   2. Recreate `practices_ranked` to expose duration_min (reward_zaps already exposed —
--      the per-log payout now reads it as the explicit per-log value, weight_class fallback).
--
-- The 10 library practices themselves are loaded as DATA (not in this migration), mirroring
-- how the practice library has always been managed.

alter table public.practices
  add column if not exists duration_min integer;

comment on column public.practices.duration_min is
  'Typical session length in minutes. Frequency lives on cadence; this is length.';

-- create-or-replace requires new columns appended at the END, so duration_min comes after
-- focus_details (the prior last column). Same shape as before otherwise.
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
    p.duration_min
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
