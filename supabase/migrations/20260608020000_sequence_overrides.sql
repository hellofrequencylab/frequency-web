-- Editable onboarding sequences (build §9.1 → ADR-162 full-version builder). The
-- audience induction copy is code-first (lib/onboarding/beta-sequences.ts is the source
-- of truth + the fallback); this table holds the owner's DB overrides AND brand-new
-- versions built in the wizard, merged over (or standing in for) the code default at
-- render (lib/onboarding/resolve-sequence.ts).
--   • splash  — legacy splash-only override column (back-compat with the first editor).
--   • data    — the FULL sequence override: any subset of a BetaSequence (audience,
--               marketingTag, splash, vera beats, oaths, heardAbout). A row with a
--               brand-new slug is a CREATED version.
create table if not exists sequence_overrides (
  slug       text        primary key,
  splash     jsonb       not null default '{}',
  data       jsonb       not null default '{}',
  audience   text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_by uuid        references profiles (id) on delete set null
);

alter table sequence_overrides enable row level security;

-- Reads/writes happen through the service role (lib/onboarding/sequence-overrides.ts);
-- host+ may read for the editor surface.
drop policy if exists sequence_overrides_select on sequence_overrides;
create policy sequence_overrides_select on sequence_overrides for select using (get_my_role() >= 'host');
