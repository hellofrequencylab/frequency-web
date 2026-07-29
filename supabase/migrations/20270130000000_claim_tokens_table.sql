-- =====================================================================
-- ONE claim-token system for every entity (ADR-907)
--
-- Replaces the per-table `claim_token text` column, which produced the
-- same live privilege escalation FOUR times by copy:
--
--   events           20260613130000   21 tokens readable by anon
--   spaces           20261145000000    9 tokens readable by anon
--   market_listings  20261137000000    1 token  readable by anon
--   listings         20261137000000    0 today, column equally exposed
--
-- Every one of those tables is deliberately anon-readable at the ROW level
-- (that is how the public directory, event listings, Classifieds and
-- Housing work) and Postgres RLS is ROW-level, so the visibility policy
-- returned the row and handed over the secret sitting on it. Three
-- migrations (20270127/28/29) closed them with column-level grants. This
-- one removes the SHAPE that keeps regenerating the bug.
--
-- ── WHAT THIS TABLE DOES DIFFERENTLY ──────────────────────────────────
--
-- 1. IT IS NOT ON THE ENTITY. Nothing anon-readable carries a secret, so
--    no future `grant select on <entity> to anon` can re-expose one. RLS
--    is ENABLED with NO POLICIES (fail-closed) and there are no grants to
--    anon/authenticated at all: service_role is the only reader.
--
-- 2. IT STORES A HASH, NEVER THE TOKEN. `token_hash` is sha256 of the
--    url-safe secret. A database dump, a log line, a screenshot of a
--    support query: none of them yield a working link. The plaintext
--    exists exactly once, in the return value of the mint call, and is
--    shown to the operator once.
--
--    sha256 without a salt or a slow KDF is CORRECT here and is not the
--    password-hashing mistake it resembles: the token is 192 bits of
--    CSPRNG output, so there is no dictionary to attack and no need to
--    slow an attacker who cannot enumerate the space. A slow KDF would
--    only tax our own verify path. (Same reasoning as GitHub PATs.)
--
-- 3. IT EXPIRES. `expires_at` defaults to 30 days out. A leaked or
--    forgotten link dies on its own. The old columns never expired, which
--    is why 30 disclosed tokens are still live today.
--
-- 4. IT IS REVOCABLE AND ROTATABLE. `revoked_at` + `revoked_reason` give
--    an operator a kill switch that does not require a schema change, and
--    rotation is minting a new row (the old one is revoked, not deleted,
--    so the audit trail survives).
--
-- 5. IT KEEPS AN AUDIT TRAIL. Who minted it, when it was sent, when it
--    was consumed and by whom. The old columns could not answer "did we
--    ever send this?" or "who claimed it?" beyond a single timestamp.
--
-- ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
-- It does not migrate the four existing columns. Those hold live tokens
-- already emailed to real business owners, and the owner's ruling is to
-- leave them: rotating breaks outreach in flight for a risk that requires
-- an attacker to have already known to look. They stay column-based and
-- revoke-protected until they are consumed or expire naturally. See
-- docs/BACKLOG.md section A for the close-out.
-- =====================================================================

create table if not exists public.claim_tokens (
  id             uuid primary key default gen_random_uuid(),

  -- WHICH ENTITY. Deliberately a (type, id) pair rather than four nullable
  -- FKs: a fifth claimable entity is a new enum value and zero schema
  -- churn, which is the whole point of this table existing.
  subject_type   text        not null check (subject_type in ('space','event','market_listing','listing')),
  subject_id     uuid        not null,

  -- THE SECRET, HASHED. Unique so a (vanishingly unlikely) collision is a
  -- constraint violation rather than two entities sharing one link.
  token_hash     text        not null unique,

  -- LIFECYCLE.
  created_at     timestamptz not null default now(),
  created_by     uuid        references public.profiles(id) on delete set null,
  expires_at     timestamptz not null default (now() + interval '30 days'),
  sent_at        timestamptz,          -- stamped when an operator actually sends it
  consumed_at    timestamptz,
  consumed_by    uuid        references public.profiles(id) on delete set null,
  revoked_at     timestamptz,
  revoked_reason text
);

-- The verify path looks a token up by hash and needs the live ones fast.
create index if not exists claim_tokens_subject_idx
  on public.claim_tokens (subject_type, subject_id);

-- AT MOST ONE LIVE TOKEN PER ENTITY. Partial, so consumed/revoked/expired
-- rows accumulate freely as the audit trail. This is what makes minting
-- idempotent at the DB level rather than only in application code — the
-- defect that silently killed emailed Space links (20270127000000's
-- sibling fix in lib/spaces/claim.ts).
create unique index if not exists claim_tokens_one_live_per_subject
  on public.claim_tokens (subject_type, subject_id)
  where consumed_at is null and revoked_at is null;

comment on table public.claim_tokens is
  'One-time capability secrets that transfer ownership of a seeded entity to whoever presents them (ADR-907). Service-role ONLY, fail-closed: RLS enabled with NO policies and no grants to anon/authenticated. Stores sha256(token), never the token: the plaintext exists once, in the mint call''s return value. Replaces the per-table claim_token column, which produced the same anon-readable privilege escalation on four tables (events, spaces, market_listings, listings) because those tables are anon-readable at the ROW level and RLS cannot hide a column. Tokens expire (30d default), are revocable, and carry an audit trail. At most one LIVE token per subject, enforced by a partial unique index, so minting is idempotent in the database rather than only in application code.';

comment on column public.claim_tokens.token_hash is
  'sha256 of the url-safe secret. Unsalted and not a slow KDF ON PURPOSE: the token is 192 bits of CSPRNG output, so there is no dictionary to attack and a slow KDF would only tax our own verify path. Never store or log the plaintext.';

-- 🔴 FAIL-CLOSED. RLS on with NO policies = deny-all for every role that
-- goes through it. service_role bypasses RLS, which is the only access
-- path (lib/claims/tokens.ts, admin client). Do NOT add a policy here, and
-- do NOT grant to anon or authenticated: a claim token has no legitimate
-- browser reader, and the four bugs this table replaces all began with a
-- secret being reachable from a browser client.
alter table public.claim_tokens enable row level security;

revoke all on public.claim_tokens from anon, authenticated;
