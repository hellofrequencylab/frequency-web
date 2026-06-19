-- Entity Spaces: add the `event_space` role to the `spaces.type` CHECK (venues / retreats).
-- Expand-only: every existing value stays valid; this just widens the allowed set so the Event
-- Space blueprint + the create wizard can offer the type. The deep ticketing/lodging/waiver
-- features are a later step (the blueprint reuses the shared entity modules for now).
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.spaces'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type%'
     and pg_get_constraintdef(oid) ilike '%practitioner%';
  if c is not null then
    execute format('alter table public.spaces drop constraint %I', c);
  end if;
end $$;

alter table public.spaces
  add constraint spaces_type_check
  check (type in ('root', 'practitioner', 'business', 'organization', 'lab', 'partner', 'coaching', 'event_space'));
