-- Editable onboarding sequences (build §9.1). The audience splash copy is code-first
-- (lib/onboarding/beta-sequences.ts is the source of truth + the fallback); this table
-- holds the owner's DB overrides, merged over the code default at render. Splash-only
-- for v1 (the most-edited surface); voiced copy / oaths stay code-first.
create table if not exists sequence_overrides (
  slug       text        primary key,
  splash     jsonb       not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid        references profiles (id) on delete set null
);

alter table sequence_overrides enable row level security;

-- Reads/writes happen through the service role (lib/onboarding/sequence-overrides.ts);
-- host+ may read for the editor surface.
drop policy if exists sequence_overrides_select on sequence_overrides;
create policy sequence_overrides_select on sequence_overrides for select using (get_my_role() >= 'host');
