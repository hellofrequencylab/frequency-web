# Per-Space (White-Label) Contact Tenancy

> Status: ⏳ Prepared, NOT yet applied. Migration written; code rescope is a coordinated
> migrate-then-deploy a human must greenlight. Source of truth: the migration
> `supabase/migrations/20261164000000_contact_tenancy_per_space.sql` + this doc.
> Related: [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) §3, the ADR-321/331
> expand→dual-write→backfill→contract tenancy pattern.

## TL;DR

`public.contacts` today has a **global** unique index on `lower(email)` — one email = at most
one contacts row across **all** Spaces. White-label separation needs the **same** email to live as
a **separate** contact in Frequency's **root** space *and* in an independent Space's CRM (the
"Daniel Tyack" business space), with separate consent and fields. This package flips uniqueness
to **per-space**: `unique(space_id, lower(email))`, rewrites the signup trigger to link members to
their **root** contact, and audits every code site that assumes one-contact-per-email so the app
code can be rescoped in the same release.

---

## 1. ADR-624 — Contacts uniqueness becomes per-space

**Decision.** Replace the global `contacts_email_lower_idx` (unique on `lower(email)`) with a
tenant-scoped `contacts_space_email_lower_idx` (unique on `(space_id, lower(email))`). Keep a
**non-unique** functional index on `lower(email)` for the few space-agnostic scans. Rewrite
`sync_contact_from_profile()` to insert/target the **root** space and conflict on
`(space_id, lower(email))`.

**Rationale.**
- White-label Spaces are separate CRMs. A lead captured in the Daniel Tyack space and a member in
  Frequency's root space may be the same person by email but must be **separate rows** with
  independent `consent_state`, `meta`, and lifecycle. The global unique index makes the second
  insert a silent no-op (`on conflict do nothing`) — the same email cannot live in two Spaces.
- `space_id` already exists on `contacts` (nullable, backfilled to root in
  `20260713010000_crm_space_id_client_notes.sql`) and a BEFORE INSERT trigger
  (`contacts_default_space_id`, `20260714010000_tenancy_hardening.sql`) stamps root on any NULL, so
  the tenancy axis is already present and populated — this change only moves the **uniqueness**
  onto it.
- This matches how `email_suppressions` was already made per-space (global NULL row + per-Space
  rows, `20260714000000_space_email.sql`) and the crm_* tenancy backfill pattern.

**Alternatives rejected.**
- *Partial unique index `where space_id = root`* — leaves tenant Spaces with no uniqueness guard,
  allowing duplicate leads within one Space. Rejected.
- *Composite on `(space_id, email)` without `lower()`* — breaks case-insensitive dedupe that every
  call site relies on. Rejected; keep `lower(email)`.

### Invariants (call-outs — honored by the migration)

| # | Invariant | How it's preserved |
|---|---|---|
| 1 | **Member profile link targets the ROOT contact.** A signup must link `profile_id` to the platform member record (root space), never to a tenant Space's lead row sharing the email. | `sync_contact_from_profile()` rewritten to `insert … (email, space_id=root, …) on conflict (space_id, lower(email)) do update set profile_id=…`. The conflict target is the root row only; a tenant lead row (`space_id <> root`) is untouched. This is the **signup path** — a wrong trigger breaks account creation, so it is minimally changed (same shape, root-targeted). |
| 2 | **Global suppression / STOP stays platform-wide.** A suppressed/opted-out email must stay suppressed everywhere regardless of per-space contacts. | `email_suppressions` is already scoped independently of contacts: `space_id NULL` = GLOBAL, non-NULL = per-Space; `isSuppressed()` matches in code (`lib/suppression.ts`). **It does not read `contacts` and is untouched.** Confirmed: the suppression path has zero dependency on contacts uniqueness. |
| 3 | **No data loss.** No `(space_id, lower(email))` duplicates may exist before the swap. | Because the OLD index was globally unique on `lower(email)`, there is at most one contacts row per email total, so no two rows can share `(space_id, lower(email))`. The migration still runs a **guard**: a `DO` block that `raise exception`s if any duplicate group exists, plus a defensive re-pin of any residual NULL `space_id` to root, **before** creating the unique index. |

### Security posture

`sync_contact_from_profile()` stays `SECURITY DEFINER` with a pinned `search_path = public`,
matching the original (`20240222000000`) and the trigger-function lockdown
(`20260926000000_lockdown_secdef_trigger_functions.sql`). `CREATE OR REPLACE` preserves the ACL;
the migration **re-asserts** `revoke execute … from public, anon, authenticated` so the posture is
explicit and idempotent (trigger-only, not a PostgREST RPC).

---

## 2. Verification query (run before applying, and as the guard)

The migration embeds this, but run it manually first to confirm a clean swap:

```sql
-- Expect ZERO rows. Any row = a (space_id, lower(email)) collision to resolve by hand first.
select space_id, lower(email) as email, count(*)
from public.contacts
group by space_id, lower(email)
having count(*) > 1;

-- Expect ZERO rows. Any NULL space_id must be re-pinned to root (the migration does this).
select count(*) from public.contacts where space_id is null;
```

---

## 3. Code audit — every one-contact-per-email assumption

Grepped for `.ilike('email'`, `.eq('email'`, `lower(email)`, `on conflict (lower(email))`,
`findContactByEmail`, and single-row `.maybeSingle()` email lookups. **17 hits touch `public.contacts`;
8 more matched but are on OTHER tables** (listed at the end so they are not re-investigated).

Legend for the fix column: **ROOT** = scope the lookup to the root space; **SPACE** = scope to the
caller's known `space_id`; **SET** = return/handle a set instead of one row; **OK** = already correct
under the new index; **KEEP** = intentional cross-space behavior, leave as-is.

### 3.1 The signup trigger (handled by the migration, no app change)

| Site | Assumes | Rescope |
|---|---|---|
| `sync_contact_from_profile()` (`20240222000000`) | `on conflict (lower(email))` links profile to the single global row | **Done in the migration**: root-targeted upsert on `(space_id, lower(email))`. |

### 3.2 The lead engine — `lib/crm/lead-capture.ts` (RISKIEST)

| Site | Assumes | Rescope |
|---|---|---|
| `findContactByEmail` — L270-279: `.ilike('email', email).maybeSingle()`, **no space filter** | one row per email | **SPACE.** Under per-space uniqueness an email in >1 Space makes `.maybeSingle()` **throw** (multiple rows) → returns null → `captureLead` treats it as "no contact" and **inserts a duplicate**. Add a `spaceId` param and `.eq('space_id', spaceId)`; callers already know the Space. |
| `captureLead` — L463 uses `findContactByEmail(email)` then inserts a sealed lead | the found row is this Space's | **SPACE.** Pass `spaceId`. The insert already sets `space_id`, so with a scoped lookup this becomes a clean per-space upsert. |
| `claimLeadOnSignup` — L665-685: `findContactByEmail(key)` **unscoped**, else `findContactByProfile` | one row to claim | **SPACE/SET.** After the trigger links the member to the ROOT contact, an email in a tenant Space **plus** the new root row = two rows → `.maybeSingle()` throws → no claim logged. Resolve the **tenant lead row** by `(space_id=grab.space, email)`, or iterate the set of rows sharing the email. |
| `linkMemberToSpaceLead` — L565-623: `findContactByProfile(profileId)` then `mayClaimSpace(current, spaceId)` | the profile's contact is the lead to re-tag into the Space | **SPACE (behavioral bug — highest severity).** `findContactByProfile` now returns the **ROOT** member contact (profile_id lives on root after the trigger). `mayClaimSpace(root, spaceX)` returns **true**, so this would **move the platform member's root contact into a tenant Space** — tenancy corruption. Fix: resolve/create the **tenant** row by `(space_id, email)` and link/claim THAT; never re-tag a root row to a tenant Space. `mayClaimSpace` must stop treating root as claimable once root is a real member scope. |
| `mayClaimSpace` — L295-299: root is "claimable" (may be re-tagged) | root rows are unclaimed backfill | **SPACE.** Legitimate for unclaimed backfilled leads today, but dangerous once a root row is a linked member (see above). Gate on `profile_id IS NULL` too, or drop the root-is-claimable rule under the new model. Human decision — see Open Questions. |

### 3.3 Consent + send gate

| Site | Assumes | Rescope |
|---|---|---|
| `lib/crm/contact-consent.ts:64` `contactConsentState` — `.eq('email', norm(email)).maybeSingle()`, no scope | one consent row per email | **SPACE/ROOT.** Multiple rows → `.maybeSingle()` throws → fail-safe to `'unknown'`, silently weakening the opt-in gate. `canEmailContact(email, purpose, spaceId?)` **already receives `spaceId`** but does not pass it — thread it through: check the sending Space's row (fall back to root when absent). |
| `lib/crm/contact-consent.ts:126` `recordGlobalStop` — `.update({consent_state:'unsubscribed'}).eq('email', addr)` across ALL rows | one row | **KEEP.** A global STOP *should* flip every Space's row for that address to unsubscribed. Correct under per-space; the non-unique `lower(email)` index keeps it fast. Note explicitly in the code comment. |

### 3.4 Scan / graduation bridge — `lib/connections/crm-sync.ts`

| Site | Assumes | Rescope |
|---|---|---|
| `syncScanToCrm` — L24-28: `.ilike('email', email).maybeSingle()` unscoped; insert without `space_id` (→ root via trigger) | one global row | **ROOT.** This is the platform scan-invite hub. Multiple rows → throw → duplicate root insert. Scope the lookup to root explicitly. |
| `syncContactToSpaceCrm` — L87-92: `.eq('space_id', spaceId).ilike('email', email).maybeSingle()` | per-space row | **OK.** Already scoped correctly — this is the **reference pattern** for every other site. Its `.maybeSingle()` is now provably safe (uniqueness = `(space_id, email)`). |

### 3.5 Webhook attribution — `lib/spaces/email.ts`

| Site | Assumes | Rescope |
|---|---|---|
| `resolveContactIdByEmail` — L539-555: `.eq('email', addr).maybeSingle()`, no scope | one row | **SPACE.** The only caller (L616-622) already has `row.space_id` from `outreach_sends`. Add a `spaceId` param and `.eq('space_id', spaceId)` so a bounce/open is attributed to the contact **in the sending Space**. Multiple rows would otherwise throw → attribution silently dropped. |

### 3.6 Platform waitlist / marketing capture (all target the ROOT hub)

All look up by email with `.maybeSingle()` and **no** space filter, then insert without `space_id`
(→ root via the BEFORE INSERT trigger). Under per-space, an email that also exists as a tenant lead
makes `.maybeSingle()` throw → treated as "new" → attempts a root insert (which then collides with an
existing root row on the new unique index). **All need the lookup scoped to ROOT.**

| Site | Rescope |
|---|---|
| `app/(marketing)/beta/actions.ts:54` | **ROOT** |
| `app/(marketing)/beta/confirm/page.tsx:18` | **ROOT** |
| `app/(marketing)/founders/actions.ts:68` | **ROOT** |
| `app/(marketing)/founders/business/actions.ts:58` | **ROOT** |
| `app/(marketing)/start/actions.ts:56` | **ROOT** |
| `app/onboarding/beta/actions.ts:160` `enrollPersonaOnboarding` | **ROOT.** Note: `byProfile` (L157) usually resolves first (the trigger already made the root row); the email fallback is the throwing path. |

### 3.7 Beta invite gate — `lib/beta/invite-gate.ts`

| Site | Assumes | Rescope |
|---|---|---|
| `isInvitedBetaContact` — L29-35: `.eq('source','beta_waitlist').ilike('email', clean).limit(1).maybeSingle()` | one beta row | **ROOT (low risk).** `.limit(1)` prevents the multi-row throw and it **fails open**, so signup is never blocked. Still scope to root for correctness (beta waitlist rows are root-owned). |

### 3.8 Import commit — `lib/crm/import/commit.ts`

| Site | Assumes | Rescope |
|---|---|---|
| `commitToSpace` — L214 `.select(...).eq('space_id', spaceId)`; L259 insert with `space_id`; L291-295 update `.eq('id', id).eq('space_id', spaceId)` | per-space dedupe by email within the Space | **OK.** Already fully space-scoped (both the `platform`→root and `space` targets pass a concrete `spaceId`). This is the intended shape; the per-space unique index makes its email dedupe authoritative. No change needed, but the on-conflict is app-side (pre-read + insert), so confirm no `.upsert('email')` sneaks in later. |

### 3.9 Matched the grep but NOT on `contacts` (no rescope — do not re-investigate)

| Site | Table | Why safe |
|---|---|---|
| `lib/crm/person.ts:175` `loadCaptures` | `network_contacts` | personal, owner-scoped |
| `lib/crm/space-contact-detail.ts:276` | `network_contacts` | owner-scoped |
| `lib/crm/engagement-stats.ts:152` | `email_events` | global by design |
| `lib/spaces/invites.ts:205` | `space_invites` | already `.eq('space_id', …)` |
| `app/(main)/waitlist/actions.ts:84` | `waitlist_entries` | track-scoped |
| `lib/suppression.ts:42,70` | `email_suppressions` | already scope-correct + global (invariant 2) |
| `lib/comms/contact-preferences.ts` | `contact_channel_preferences` | already keyed `(email, space_id, topic, channel)`; `onConflict` correct |
| `lib/connections/matching.ts:63` | `network_contacts` | personal matching |

**Audit total: 17 contacts sites.** Highest-risk: `linkMemberToSpaceLead` (would move a member's
root contact into a tenant Space), `findContactByEmail`/`claimLeadOnSignup` (`.maybeSingle()` throws
→ duplicate inserts / lost claims), and `contactConsentState` (silent consent-gate weakening).

---

## 4. Coordinated rollout

This **cannot be half-shipped**: the trigger and the uniqueness invariant flip together, and the app
code must not throw on multi-row email lookups. Order it as **back-compat code first, then migrate,
then enable per-space writes**:

1. **Deploy code that is safe under BOTH indexes** (does not depend on the flip):
   - Replace every unscoped `contacts` email `.maybeSingle()` with a scoped read
     (`.eq('space_id', <space|root>)`) or a set-returning read (`§3` fixes). Scoped-to-root reads
     return the exact same row under the OLD global index, so this deploy is behavior-preserving
     **before** the migration and correct **after** it.
   - Fix `linkMemberToSpaceLead` / `mayClaimSpace` to resolve the tenant row and never re-tag root.
   - Thread `spaceId` into `contactConsentState`, `resolveContactIdByEmail`, `findContactByEmail`.
2. **Apply the migration** (`20261164000000`): guard → new unique index → drop global unique →
   non-unique `lower(email)` index → rewrite trigger → re-assert revoke.
3. **Enable per-space capture writes** (the Daniel Tyack space can now hold a lead whose email is
   also a root member). No further deploy needed if step 1 already scopes writes.
4. **Regenerate `lib/database.types.ts`** (contacts is largely reached untyped today, ADR-246, so
   this is low-impact but do it for the index-aware upsert seams).

### Verification (post-apply)

- `\d public.contacts` shows `contacts_space_email_lower_idx` UNIQUE and no `contacts_email_lower_idx`.
- The two §2 queries return zero rows.
- Sign up a brand-new email → exactly one root contact with `profile_id` set (trigger works).
- Insert the SAME email as a lead in a non-root Space → succeeds (previously a no-op); root row
  unchanged; both rows visible, independent `consent_state`.
- A global STOP on that email flips **both** rows to `unsubscribed` and adds a global suppression.
- Supabase advisors: no new `unindexed_foreign_keys` / duplicate-index warnings.

### Rollback

The change is index-shape + one function body; no column drops, no data deletion.

```sql
-- Restore the global unique index (will FAIL if per-space duplicates were created after cutover —
-- that failure is the signal that real white-label data now exists and rollback is unsafe).
create unique index if not exists contacts_email_lower_idx on public.contacts (lower(email));
drop index if exists public.contacts_space_email_lower_idx;
drop index if exists public.contacts_email_lower_idx_nonuniq;
-- Re-apply the ORIGINAL sync_contact_from_profile() body from 20240222000000_contacts_backfill.sql
-- (global on conflict (lower(email))), then re-assert the revoke.
```

**Rollback is only clean until the first duplicate-email-across-Spaces row is written.** After that,
re-creating the global unique index will fail by design — do not force it; roll forward instead.

---

## 5. How to run the Daniel Tyack space upload test after this lands

1. Confirm the migration is applied (§4 verification, first bullet).
2. Ensure the "Daniel Tyack" business Space exists and you have CRM access on it
   (`spaceFunctionAccess(space, 'crm', role)` — the `commitToSpace` gate).
3. Pick a CSV that includes at least one email **already a Frequency member** (a root contact) plus
   fresh emails.
4. Import via the staged CSV flow (`lib/crm/import/*`) targeting the Daniel Tyack Space
   (`targetKind: 'space'`, `targetSpaceId = <daniel space id>`).
5. **Expected:** every row commits as a sealed lead in the Daniel Tyack Space
   (`consent_state='unknown'`, `space_id = <daniel space>`), **including** the member's email — which
   now creates a *separate* tenant row instead of the old silent skip. The member's **root** contact
   is untouched (its `profile_id`, consent, and history stay put).
6. **Regression:** sign up a new account with an email you first imported as a Daniel-space lead. The
   trigger creates/links the **root** contact; the Daniel-space lead row stays a separate row; the
   claim flow (once §3.2 is fixed) logs a `claim` touchpoint on the **tenant** lead without moving it
   to root.

---

## 6. Open questions for a human before applying

1. **`mayClaimSpace` root policy.** Once a root contact carries a real member (`profile_id` set),
   should root ever be "claimable" (re-taggable to a tenant Space)? Recommendation: **no** — gate on
   `profile_id IS NULL`. Confirm this doesn't regress the current "unclaimed backfill lead in root
   gets adopted by a Space" behavior for genuinely unclaimed rows.
2. **Consent fallback scope.** For `canEmailContact` with no `spaceId` (platform marketing), read the
   **root** consent row. Confirm that's the intended semantics vs. "any subscribed row anywhere".
3. **Deploy gating.** Confirm the §4 step-1 code (scoped reads) ships and soaks **before** the
   migration, so no unscoped `.maybeSingle()` is live when the second row per email becomes possible.
4. **Types regen timing.** OK to defer `lib/database.types.ts` regen (ADR-246 untyped seams) or do it
   in the same PR?
