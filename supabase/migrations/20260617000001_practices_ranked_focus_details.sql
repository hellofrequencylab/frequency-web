-- Fix schema drift: the practices_ranked view predates practices.focus_details (added in
-- 20260616190000_practice_focus_details), so any read selecting focus_details from the view errored
-- ("column practices_ranked.focus_details does not exist"). RANKED_COLS in lib/practices.ts selects
-- it, so this silently emptied the practice library AND broke the Vera Journey composer
-- (searchLibraryPractices threw / returned no rows). Recreate the view exposing focus_details
-- (appended last to satisfy CREATE OR REPLACE's same-order + append-only column rule).
--
-- NOTE: the prior definition (20260614200000_rewards_economy_v2) created the view from
-- `p.*`, so its column order is the physical order of practices, which does not match the
-- explicit list below. CREATE OR REPLACE forbids reordering/renaming existing view columns,
-- so drop-and-recreate (the same approach rewards_economy_v2 used) instead. Nothing SELECTs
-- from this view, so the drop is safe; grants + security_invoker are re-applied below.
drop view if exists public.practices_ranked;
create view public.practices_ranked
  with (security_invoker = true) as
 select p.id,
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
    COALESCE(a.adopters, 0::bigint) AS adopters,
    COALESCE(l.logs_30d, 0::bigint) AS logs_30d,
    COALESCE(l.logs_total, 0::bigint) AS logs_total,
    COALESCE(l.logs_30d, 0::bigint) * 3 + COALESCE(a.adopters, 0::bigint) * 2 + COALESCE(l.logs_total, 0::bigint) AS score,
    p.focus_details
   FROM practices p
     LEFT JOIN ( SELECT member_practices.practice_id,
            count(*) AS adopters
           FROM member_practices
          WHERE member_practices.active = true
          GROUP BY member_practices.practice_id) a ON a.practice_id = p.id
     LEFT JOIN ( SELECT practice_logs.practice_id,
            count(*) FILTER (WHERE practice_logs.logged_for >= (CURRENT_DATE - 30)) AS logs_30d,
            count(*) AS logs_total
           FROM practice_logs
          GROUP BY practice_logs.practice_id) l ON l.practice_id = p.id;

-- Re-apply the server-only access policy (dropped with the view above).
revoke all on public.practices_ranked from anon, authenticated;
grant select on public.practices_ranked to service_role;
