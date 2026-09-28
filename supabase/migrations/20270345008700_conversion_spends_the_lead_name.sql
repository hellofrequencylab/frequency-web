-- The conversion door spends the lead's name onto a profile that is still the trigger's mint (LIVE-450).
--
-- THE GAP. convert_signup_leads_for_me (20270345003300) stamps converted_at and converted_profile_id
-- on the signup_leads row held by the caller's PROVEN address, and stops. The name the guest typed
-- into the RSVP form (guest-rsvp-actions.ts passes it as p_display_name) or into the induction
-- (first_name / display_name) stays on the lead row and is never read back. Meanwhile the signup
-- trigger handle_new_auth_user (20261013000000) has minted the profile as the email local part with
-- a generated handle, so a guest who RSVP'd as "Sam Rivera", signed in, and was admitted appears to
-- the community as "sam.rivera" until the first-run checklist walks them to /settings/profile. The
-- name they already gave is sitting one join away.
--
-- THE FIX. After the stamp, and only when the stamp landed, the function reads the converted lead's
-- display_name (else first_name) and applies it to the profile IF AND ONLY IF the profile is still
-- the trigger's mint. Nothing else changes: the handle stays, the return value stays the count of
-- leads stamped, and a profile whose name or handle has been chosen is never touched.
--
-- WHY THE MINT CHECK IS IN SQL, AND WHAT IT MIRRORS. The row's two honest routes were a SQL-side
-- mint check or a TypeScript pass in the auth callback. signup_leads is RLS-on with zero policies,
-- so a TypeScript pass would need the service-role client on the login path to read the lead back,
-- a new door for a bookkeeping write. Here the conversion already holds every fact inside one
-- SECURITY DEFINER function: the lead, the profile, and auth.uid(). The check reconstructs the
-- trigger's FIRST-TRY handle from the profile's own display_name and the auth id, exactly as
-- lib/onboarding/identity.ts (mintedHandleFor) does for the checklist:
--
--   base   = 'member'                               when display_name = 'New Member'
--          = lower(regexp_replace(display_name, '[^a-z0-9]', '', 'g'))   otherwise, 'member' if empty
--   handle = base || '_' || first 6 hex of auth.users.id (dashes stripped)
--
-- display_name IS the local part at mint time, so these are the inputs the trigger used. A member
-- who changed either name or handle fails the equality and is left alone (an established member
-- does not get renamed by a stale lead). The trigger's collision fallback (a random suffix) also
-- fails the equality and reads as chosen: fail-open, the same call identity.ts makes. A NULL handle
-- reads as not chosen, also as identity.ts has it.
--
-- WRONG OVERWRITE IS THE RISK, so the guards are conjunctive: the stamp must have landed this call
-- (a second sign-in stamps nothing and so spends nothing), the lead must carry a name, and the
-- profile must still be the mint. The name is trimmed and cut to 80 characters, the same bound
-- lib/profile-input.ts applies to a name typed into the editor.
--
-- Same signature and return type, so `create or replace` is enough and the ACL is preserved; the
-- grants are restated from zero anyway, role-explicit (ADR-959). The verdict in
-- scripts/function-grants.txt is unchanged: authenticated.
--
-- House style: no em or en dashes. pgTAP: supabase/tests/signup_lead_name_spend.test.sql.

begin;

create or replace function public.convert_signup_leads_for_me()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_email      text;
  v_lead_name  text;
  v_n          integer;
begin
  -- WHO. auth.uid() is null for anon and for any caller without a JWT, so the profile lookup
  -- returns nothing and the function is a no-op for them. There is no argument to spoof here
  -- because there is no argument at all.
  -- ORDERED, because `profiles.auth_user_id` carries only an INDEX and not a unique constraint.
  -- One auth user really can own more than one profile row: a trigger mints one at signup, and
  -- anything that inserts a second is not refused by the schema. The EARLIEST profile wins: for a
  -- duplicated account that is the one minted at signup, which is the row the rest of the platform
  -- has been treating as theirs for longest. `id` breaks a tie so the result is total, and
  -- `nulls last` keeps a row with no created_at from sorting ahead of a real one (20270345003300).
  select p.id into v_profile_id
    from public.profiles p
   where p.auth_user_id = auth.uid()
   order by p.created_at asc nulls last, p.id asc
   limit 1;

  if v_profile_id is null then
    return 0;
  end if;

  -- WHICH ADDRESS. Read server-side out of auth.users, never taken from the caller (ADR-854: a
  -- typed address keys nothing). email_confirmed_at is the whole proof: an unconfirmed address is a
  -- claim, and stamping on a claim would let a signup with someone else's address absorb that
  -- person's lead row.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  -- THE NAME, read BEFORE the stamp from the row the stamp is about to touch. signup_leads is
  -- unique on lower(email), so this is at most one row; the order clause only makes that total.
  -- display_name is what the RSVP door and the induction's name beat write; first_name is the
  -- induction's earlier answer. A lead with neither yields NULL and spends nothing.
  select left(btrim(coalesce(l.display_name, l.first_name)), 80) into v_lead_name
    from public.signup_leads l
   where lower(l.email) = v_email
     and l.converted_at is null
   order by l.updated_at desc nulls last, l.id asc
   limit 1;

  -- SOURCE-BLIND, ON PURPOSE. This converts a 'beta_induction' or 'feature_funnel' lead carrying
  -- the same proven address just as readily as an 'event_rsvp' one: signup_leads holds one row per
  -- PERSON, the address has been proved to belong to this account, and a half-finished induction
  -- by the same person is the same half-finished signup whichever door it came through.
  --
  -- `converted_at is null` is what makes this idempotent: a second call matches no row, stamps
  -- nothing, and returns 0. The FIRST conversion is the one that counts.
  update public.signup_leads as l set
    converted_profile_id = v_profile_id,
    converted_at = now(),
    updated_at = now()
  where lower(l.email) = v_email
    and l.converted_at is null;

  get diagnostics v_n = row_count;

  -- SPEND THE NAME, only on the call that stamped, only when there is a name, and only onto a
  -- profile that is still the trigger's mint (the header explains the formula and its mirror in
  -- lib/onboarding/identity.ts). A chosen name or a chosen handle fails the equality and the
  -- profile is left exactly as it was.
  if v_n > 0 and v_lead_name is not null and v_lead_name <> '' then
    update public.profiles as p set
      display_name = v_lead_name
    where p.id = v_profile_id
      and (
        p.handle is null
        or p.handle = (
          case
            when p.display_name = 'New Member' then 'member'
            else coalesce(nullif(lower(regexp_replace(p.display_name, '[^a-z0-9]', '', 'g')), ''), 'member')
          end
        ) || '_' || substr(replace(auth.uid()::text, '-', ''), 1, 6)
      );
  end if;

  return v_n;
end;
$$;

comment on function public.convert_signup_leads_for_me() is
  'Stamps every unconverted signup_leads row whose address matches the CALLER''S OWN confirmed auth.users email, returns how many it stamped, and on the call that stamps applies the lead''s display_name (else first_name) to the caller''s profile if and only if that profile is still the signup trigger''s mint (display_name = email local part, handle = its sanitised form plus the first 6 hex of the auth id, mirrored from lib/onboarding/identity.ts; LIVE-450). A chosen name or handle is never overwritten. It exists because mark_signup_lead_converted requires the claim token capture_signup_lead handed the capturing browser, and an event guest who RSVPs by email and signs in days later on another device holds no such token; this door is proved by authentication instead. It takes no arguments and never accepts an email (ADR-854), reads the address server-side for auth.uid() only, refuses an unconfirmed address, returns 0 and writes nothing when there is no profile or no proven address, is idempotent (it only touches converted_at is null, and spends the name only on that call), and is deliberately source-blind. authenticated only.';

-- Grants restated from zero, role-explicit (ADR-959). `create or replace` keeps the ACL, so this
-- changes nothing; it makes the verdict legible in the file that last defined the function.
revoke execute on function public.convert_signup_leads_for_me() from public, anon, authenticated;
grant execute on function public.convert_signup_leads_for_me() to authenticated;

commit;

-- Rollback: re-run section 3 (the previous definition of this function) and the grant pair of
-- 20270345003300_event_rsvp_leads.sql. No column, table or index is touched here.
