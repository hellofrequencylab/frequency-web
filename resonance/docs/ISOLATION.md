# Isolation & breakout contract

**The promise:** this app can be removed from Frequency's repo and database and
stood up on its own, with no untangling. This doc is the contract that keeps that
true, and the exact procedure to do it.

## Why this exists

The Frequency org is on Supabase's free plan, which caps the account at **2
projects**, both already in use. There's plenty of disk (the Frequency DB is ~50
MB of 500 MB), but no room for a *third* project right now. So Resonance lives
**inside** the existing Frequency Supabase project, in its own schema, built so
that moving it to a dedicated project later is a mechanical lift, not a rewrite.

## The contract (do not violate)

| # | Rule | Why |
|---|---|---|
| 1 | All app data lives in the **`resonance`** Postgres schema. | One namespace = one `pg_dump -n`. |
| 2 | **No foreign key** from `resonance` into `public`, `auth`, or any other schema. | FKs are what make a schema un-liftable. |
| 3 | User identity is a plain `uuid` (host/Frequency id or own auth id), never an FK to `auth.users`. | Identity stays a *value we trust*, not a join. |
| 4 | Data access is **server-side only** (service role), so the app does not depend on the shared project exposing the schema via PostgREST. | No shared-project config coupling. |
| 5 | Realtime uses **Broadcast + Presence**, not Postgres Changes. | Not table-bound, so no shared publication coupling. |
| 6 | App code imports **nothing** from Frequency, and Frequency imports nothing from here. | Code separation mirrors data separation. |
| 7 | Integration happens only across the documented **seam** (JWT + postMessage + webhooks), never the database. | The seam is portable; a shared table is not. |

Root Frequency tooling is configured to ignore `resonance/` (root `tsconfig.json`
`exclude` and `eslint.config.mjs` ignores), so the two builds never reach into
each other.

## Breakout procedure (when a dedicated project is available)

Trigger: the org frees a project slot (pause one, or upgrade to Pro) **or** the
app earns its own infrastructure.

1. **Create** a new Supabase project (or new account/org).
2. **Apply** `supabase/migrations/*` there in order. Because every object is in
   `resonance` and self-contained, this reproduces the full app schema.
3. **Move data** (if any): `pg_dump --schema=resonance --no-owner` from the shared
   project, restore into the new one.
4. **Repoint** env vars (`RESONANCE_SUPABASE_*`) to the new project. No code change.
5. **Verify** the app against the new project.
6. **Drop** from the shared project: `DROP SCHEMA resonance CASCADE;`. Frequency's
   `public`/`auth` data is untouched because nothing ever referenced it.
7. **Extract the repo** (optional, any time): `git filter-repo --subdirectory-filter resonance`
   into a fresh repo, or `git subtree split`. No code rewrites because the project
   already has its own `package.json`, tsconfig, and Supabase config.

## Self-check before any migration or feature

- [ ] Does this add an FK that leaves the `resonance` schema? → **stop, redesign.**
- [ ] Does this read/write a Frequency `public` table directly? → **stop, use the seam.**
- [ ] Does this import Frequency app code? → **stop, copy or abstract it.**
- [ ] Does it require the shared project to expose `resonance` to anon? → **prefer server-side access.**
