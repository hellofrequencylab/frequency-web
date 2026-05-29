# Capabilities (inline admin) & Cross-Platform Alignment

> Two linked requirements: (1) **admin/edit functions appear *in context* on the
> page** for whoever is allowed — not behind an admin tab — and (2) a **native
> mobile app deeply aligned with the website**, sharing the same databases. These
> are linked because both need *one* answer to "what can this person see and do
> here?", computed server-side and consumed by every client.
>
> Builds on [SCALE-ARCHITECTURE.md](SCALE-ARCHITECTURE.md) (the layered/contract
> model), [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) (templates/slots), and
> [IA-STRATEGY.md](IA-STRATEGY.md) (role + milestone gating). Strategy/decision doc.

---

## 1. One policy layer answers "what can this person see/do here?"

Three things we've described separately are actually the **same question**:

- **Composition** — which modules render (SCALE-ARCHITECTURE).
- **Gating** — locked / available / hidden (IA-STRATEGY §2).
- **Inline actions** — which admin/edit affordances appear (this doc).

Unify them in a single **policy/capability resolver** in the `core/` layer:

```
getCapabilities(user, scope) → { capabilities: Set<Capability>, modules: CompositionDescriptor }
```

- **Capabilities are granular *actions*, not roles** — `circle.post`,
  `circle.editSettings`, `circle.moderate`, `circle.assignTask`,
  `task.volunteer`, `task.claim`, `profile.edit`, `nexus.admin`, … Granular
  per-action permissions are the recommended model
  ([Auth0](https://community.auth0.com/t/best-practice-for-role-based-or-permission-based-authorization-in-a-react-spa/194364)).
- **Derived from several inputs, not just the global role ladder:**
  - global role (`member < crew < host < guide < mentor < janitor`),
  - **per-scope role** (`memberships.volunteer_role` — "host of *this* circle"),
  - involvement / milestones (IA-STRATEGY §2),
  - entity state (e.g. tasks exist, circle is full).

This is why a **crew member can hold `task.volunteer` on a specific circle**
without any global role change — the capability comes from their per-scope
relationship + the presence of open tasks, computed server-side.

---

## 2. Inline admin & contextual actions (regular users never see an admin tab)

**Principle: actions live where the thing lives.** The Admin tab is reserved for
the **Janitor**'s deep, cross-entity work (bulk operations, the moderation queue,
system config) — not for the everyday acts of running one circle.

Extend the **action slots** on the Detail template (PAGE-FRAMEWORK §3):

| Who, where | What the policy layer renders |
|---|---|
| **Host** on *their* circle | inline header/action bar: *Edit circle*, *Assign task*, *Moderate*, *Broadcast to circle* |
| **Crew** on a circle with open tasks | a **Tasks module**: claim / volunteer for host-assigned tasks (`task.volunteer`, `task.claim`) — schema already has `crew_tasks` |
| **Member / anon** on that circle | content only — no chrome, no empty buttons |
| **Owner** on their profile | *Edit profile* + **click-to-edit sections** (edit-in-place), optimistic save |
| **Janitor** anywhere | inline actions **plus** the Admin tab for deep work |

UX notes:
- **Edit-in-place**: reveal the affordance only when capable; edit at the
  section level; optimistic UI; re-check on save (§3).
- For things a user **shouldn't even know exist**, conditionally render them out
  of the DOM entirely rather than disabling — a cleaner, less cluttered interface
  ([conditional render](https://stack.convex.dev/authorization)).

---

## 3. Non-negotiable: capabilities are UX; the server is the authority

- The client uses the capability set to **show/hide affordances** — this is a UX
  improvement, **not** a security mechanism. "Assume the client might be running
  code you didn't write."
  ([Auth0](https://community.auth0.com/t/best-practice-for-role-based-or-permission-based-authorization-in-a-react-spa/194364))
- **Every mutation re-checks authorization server-side**, independently of what
  the UI showed ([Convex authz](https://stack.convex.dev/authorization)).
- This *already matches* `docs/ARCHITECTURE.md` ("authorization MUST be enforced
  in application code"). The capability set is simply the **presentation
  projection** of the same policy the server enforces: **one policy, two
  consumers** — render (client) and enforce (server). Define it once; never let
  them drift.

---

## 4. Cross-platform alignment — a native app changes an earlier decision

### 4a. Shared logic must live where BOTH clients can reach it
- **Next.js Server Actions and RSC are web-only.** A native app cannot invoke a
  server action or consume an RSC component tree. So any logic that lives *only*
  in server actions is **not shared** — it would have to be re-implemented for
  mobile, which is exactly the drift to avoid.
- Therefore the **contract seam (SCALE-ARCHITECTURE) is now the shared backbone**,
  and it must be **presentation-neutral data** — typed endpoints/RPCs returning
  *view models + capability sets + composition descriptors*, **not rendered UI**.
  Web RSC renders that data; native renders the same data with native components.
  (The "keep a typed contract" insurance from SCALE-ARCHITECTURE is now
  **load-bearing**, not optional.)

### 4b. Authorization must converge on a client-agnostic boundary
- Today: `createAdminClient()` (service role, **bypasses RLS**) + app-side authz
  at ~200 sites. This is a **web-server-only** pattern — a mobile client can't
  hold a service-role key, and you don't want to re-implement those checks in a
  second codebase. (The service-role key **always** bypasses RLS
  — [Supabase docs](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).)
- **Best practice for web + mobile: RLS is the "one secure source"** — it enforces
  access regardless of client, and app-logic bugs can't bypass it
  ([RLS best practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices),
  [RLS value for multi-client](https://github.com/orgs/supabase/discussions/27401)).
- **Recommended hybrid:** RLS for data access **+** a thin set of `SECURITY
  DEFINER` **RPCs / BFF** for complex composition, capability computation, rate
  limiting, and multi-row mutations — both web and mobile call the *same* RPCs
  ([service-role vs RLS discussion](https://github.com/orgs/supabase/discussions/30739)).
- **Evolution, not a rewrite:** new shared logic goes through RLS-enforced access
  + RPCs; the service-role/app-authz pattern becomes a web-server-internal detail
  phased toward the shared boundary. **You've already started** — the public
  `/discover` layer moved to `SECURITY DEFINER` RPCs + a cookieless anon client
  (ROADMAP P3.30). Generalize that direction.

### 4c. Shared vs platform-specific
| Shared — build once, both consume | Platform-specific — per platform |
|---|---|
| Domain/core logic, data, **RLS policies + RPCs** | Rendering (RSC/web vs native components) |
| The typed contract / view models | Navigation, gestures, platform affordances |
| **Capability + composition descriptors** | Local store / offline cache |
| **Design tokens** (W3C JSON → CSS vars *and* native constants) | — |
| Realtime channels (Supabase **Broadcast**, has web + native SDKs) | — |

Design-token decoupling now pays off **twice** (one token source → web + native),
and the capability/composition descriptors guarantee the **same inline-admin
affordances appear consistently on both platforms** — the "deep alignment" you
want falls out of computing them server-side.

### 4d. Mobile strengthens the sync-engine bet
The local-first sync-engine recommendation (SCALE-ARCHITECTURE §4) gets
*stronger* with mobile: offline + instant UI matter most on phones, and engines
like PowerSync target mobile/cross-platform with **Postgres as source of truth**.
Mobile is a prime first beneficiary when you pilot a sync engine on one surface
(messaging, feed, notifications, or gamification counters).

---

## 5. What to add to "decouple now"

- A **capability resolver** in `core/`: `getCapabilities(user, scope)` — consumed
  by the server (enforce) *and* the contract (project to clients).
- Capabilities defined as **granular actions**, derived from global role +
  per-scope role (`volunteer_role`) + involvement + entity state.
- Detail templates expose **action slots**; the policy layer fills them.
- Treat **RLS + RPCs as the shared authorization boundary**; route new
  cross-client logic there, not into web-only server actions.
- Keep contract outputs **presentation-neutral** (data, not RSC/HTML).

## Open decisions

1. **Mobile stack** — React Native (max reuse: shared TS contract types + design
   tokens) vs native Swift/Kotlin (best UX, more duplication). Determines how much
   contract code is *literally* shared.
2. **Authorization-convergence pace** — how aggressively to migrate from
   admin-client/app-authz to RLS + RPC. Real cost; do it surface-by-surface
   (public/discover already started).
3. **Contract transport** — PostgREST + RLS consumed directly by both clients
   (least duplication) vs a dedicated BFF (tRPC/GraphQL/REST) for more control
   over complex composition. Likely hybrid.
