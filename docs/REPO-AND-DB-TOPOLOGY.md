# Repo & database topology

**The rule: one app = one repo + one Supabase project.** Frequency is its own repo and its own
database, referenced by nothing else. Other apps are their own repos and their own projects. Decision
recorded in ADR-512.

---

## 1. The model

| Pattern | Repos | Database | Use when |
| --- | --- | --- | --- |
| **Isolated** ← Frequency is this | 1 per app | 1 per app | Independent products. The safe default. |
| **Platform** | a monorepo (or 1 schema-owner repo) | 1 shared, schema-per-app + RLS | A true suite that shares the same users/data. Migrations + types live in one place. |
| ⚠️ Avoid | many independent repos | 1 shared | You get the coupling of a shared DB without the coordination of a shared repo. |

A database schema is a **contract**. Whoever owns migrations owns it. Sharing one DB across many
independent repos means every schema change is a cross-repo coordination event, one app's load/locks can
stall the others, and a breach in the weakest app exposes **all** the data. If apps genuinely share data,
pull them into a monorepo so the schema has a single owner; otherwise give each its own database.

**Default for new apps: separate repo + separate database** (mirror Frequency). Reserve a shared database
for a real suite-in-a-monorepo.

---

## 2. Current state (verified 2026-07-03)

**One Supabase organization — "Frequency™" (`hkveprznovcteywuczcv`) — holds two projects:**

| Project | Ref | What it is |
| --- | --- | --- |
| **Frequency Community** | `azsqfeonabsbmemvddqd` | Frequency's live production DB (~222 tables, us-west-2, PG 17.6). **`frequency-web` targets only this.** |
| **hook** | `qakbtenvporcfkznivdh` | A **separate app** — a practitioner/coach OS (53 RLS-on tables: courses/coach/CRM/communities). Not Frequency. |

**`frequency-web` ↔ Frequency Community is a clean 1:1.** The repo has **zero** code/config/env references
to `hook` or any other project (the only mention is a single doc line describing Hook as a system to learn
from). `supabase/config.toml` only sets the local CLI label (`project_id = "frequency-web"`); the real
runtime binding lives in Vercel/local env, which docs repeatedly confirm is `azsqfeonabsbmemvddqd`.

> The `resonance/` sub-app is designed to share the Frequency project via a dedicated `resonance` schema.
> That is a shared-schema sub-app inside `azsqfeonabsbmemvddqd`, not a separate project. If Resonance
> becomes its own product, give it its own project.

---

## 3. What to fix (to match the intent)

Frequency is already isolated. The only mismatch: both projects sit in the **same** Supabase org. To
separate Frequency from the other apps:

1. **Supabase — split the orgs.** Create a second org (e.g. "Onesky" or "Labs — in dev") and **transfer**
   the `hook` project into it (Supabase dashboard → project settings → transfer). Then "Frequency™" holds
   only Frequency Community. Every future dev app = a new project in the dev org.
2. **GitHub — one repo per app.** Keep `frequency-web` = Frequency. Point the Onesky/Energetics repo at the
   `hook` project via **its own** env vars + `config.toml` + `supabase/migrations/`. Confirm whether
   Onesky is the `hook` coach-OS app (then wire it) or a different app (then it needs its own new project).
3. **Frequency — nothing to change.** It is already correctly wired and isolated.

**Wiring any repo to its project (three touchpoints):** env vars (`NEXT_PUBLIC_SUPABASE_URL` + anon +
service-role, in Vercel and local) · `supabase/config.toml` `project_id` = the project ref · that repo's
own `supabase/migrations/`.

---

## 4. In-repo vs dashboard

- **Dashboard actions (owner does these):** create/transfer Supabase orgs & projects, create GitHub repos,
  set env vars. These can't be scripted from a repo.
- **In-repo (safe to script per app):** `config.toml`, `.env.example`, the `supabase/migrations/` scaffold,
  and this topology doc. This file is the authoritative statement of the rule.

---

## 5. The invariant

**Frequency stays its own repo + its own database, referenced by nothing else.** Whatever the other apps
do, this does not change.
