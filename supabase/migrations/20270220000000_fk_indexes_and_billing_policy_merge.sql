-- Two Supabase advisor findings, both cheap, both verified against the live database first.
--
-- (1) unindexed_foreign_keys ×7. A foreign key with no index on its own side makes every
--     cascade / referential check a sequential scan of the child table, and makes a delete on the
--     PARENT scan the child. All seven columns were read back off pg_constraint rather than
--     inferred from the constraint names, because `*_from_space_id_fkey` naming a column
--     `from_space_id` is a convention, not a guarantee.
--
-- (2) multiple_permissive_policies on space_billing_agreements. Two permissive SELECT policies for
--     `authenticated` means Postgres evaluates BOTH for every row and ORs the results. Merging
--     them into one policy with the same OR is an identity transformation on the predicate — a
--     permissive policy set is already a disjunction — so nobody gains or loses access. The
--     original pair is preserved verbatim below as the two arms.
--
-- Written after the RLS + grants sweep, so the surrounding posture is unchanged: no INSERT /
-- UPDATE / DELETE policy exists on this table by design and none is added here. Writes stay
-- service-mediated.

-- ── 1. Foreign-key indexes ───────────────────────────────────────────────────────────────────
-- CONCURRENTLY is deliberately NOT used: it cannot run inside a transaction block, and the
-- migration runner wraps each file in one. These tables are small (the advisor reports them as
-- never-scanned), so a brief lock is not worth splitting the migration for.

create index if not exists idx_claim_tokens_consumed_by
  on public.claim_tokens (consumed_by);
create index if not exists idx_claim_tokens_created_by
  on public.claim_tokens (created_by);

create index if not exists idx_event_host_transfers_from_space_id
  on public.event_host_transfers (from_space_id);
create index if not exists idx_event_host_transfers_requested_by
  on public.event_host_transfers (requested_by);
create index if not exists idx_event_host_transfers_responded_by
  on public.event_host_transfers (responded_by);

create index if not exists idx_member_practices_journey_plan_id
  on public.member_practices (journey_plan_id);

create index if not exists idx_topical_channels_template_id
  on public.topical_channels (template_id);

-- ── 2. Collapse the two permissive SELECT policies into one ──────────────────────────────────
-- Arm 1 (was "staff read"):          web_role admin/janitor see everything.
-- Arm 2 (was "owner or admin read"): a Space owner, or an ACTIVE admin member, sees their own.
-- The tenant subqueries stay wrapped in (select …) so they run once per statement rather than
-- once per row, exactly as the originals did.

drop policy if exists "space_billing_agreements: staff read" on public.space_billing_agreements;
drop policy if exists "space_billing_agreements: owner or admin read" on public.space_billing_agreements;

create policy "space_billing_agreements: staff, owner, or space admin read"
  on public.space_billing_agreements for select to authenticated
  using (
    (select private.get_my_web_role()) in ('admin', 'janitor')
    or space_id in (
      select s.id from public.spaces s
      where s.owner_profile_id = (select private.get_my_profile_id())
    )
    or space_id in (
      select sm.space_id from public.space_members sm
      where sm.profile_id = (select private.get_my_profile_id())
        and sm.role = 'admin'
        and sm.status = 'active'
    )
  );
