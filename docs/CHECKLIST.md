# Owner checklist: what to verify & decide (when you're at a computer)

> 👉 **For the ordered, step-by-step path, use [START-HERE.md](START-HERE.md).**
> This file is the detailed reference (decisions + tech debt) behind it.
>
> A running list of things only *you* can do (apply DB changes, eyeball UI, make
> product calls). The developer-side phase tracker is [BUILD-PHASES.md](BUILD-PHASES.md);
> this is the human action list. Work through it on the **test/dev side**, then
> promote to production when satisfied. Check items off as you go.

> ✅ **Reconciled 2026-06-02:** the 🔴 "Blocking" migrations below are **all applied to prod**
> (verified via `supabase migration list`, through `20240303000000`, well past this batch), and
> the 🧹 tech-debt items are **resolved** (`eslint .` is clean repo-wide). This section is kept for
> history; the live plan is [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md). Still genuinely owner-only:
> Studio access grant, the Resend webhook secret, and the domain/env cutover ([LAUNCH.md](LAUNCH.md)).

## 🔁 Standing deploy gate: apply migrations on every merge (ADR-185)

> ⚠️ A migration is **done only when applied to the live DB**, not when merged. Code that merges
> ahead of its schema leaves the feature silently broken in prod (and the temporary untyped-cast
> pattern becomes a standing liability instead of a brief one). On the **2026-06-09** reconcile, a
> batch had merged without being applied and was applied in one pass: `page_content`,
> `qr_page_folders`, `circle_sidebar_order`, `founders_first_week_badge`, `training_paths`,
> `connect_accounts`, `tips`, `event_tickets`.

On every merge that adds a `supabase/migrations/` file, run, and don't call the change shipped until you have:

- [ ] `supabase migration list`: confirm the new file shows **pending**.
- [ ] `supabase db push`: apply it; confirm `migration list` now shows it applied.
- [ ] Regenerate types (`supabase gen types typescript --linked > lib/database.types.ts`) and drop the
      temporary `as unknown as …` / untyped-client casts the pending migration required.
- [ ] Record the "applied to prod" status against the item in [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md).

The `/maintenance` skill's migration-drift check (repo vs applied) is the automated backstop.

## 🔴 Blocking: do first
- [x] **Review + apply the new migrations**: ✅ all applied to prod (verified
      `supabase migration list`). `npx supabase migration list` →
      `npx supabase db push`. New, unapplied, and written without a live DB to
      test against, so **read them first**:
      - `20240214000000_enable_postgis_geography.sql` (PostGIS + `circles.geog`)
      - `20240215000000_engagement_events.sql` (event ledger)
      - `20240216000000_physical_nodes.sql` (nodes + captures + `node_within_range`)
      - `20240217000000_node_zaps_value.sql` (per-node zap reward amount)
      - `20240218000000_partners_module.sql` (partners + offers + redemptions)
      - `20240219000000_notification_queue.sql` (durable async job queue)
      - `20240220000000_email_events.sql` (email_events + email_suppressions): **new since the first batch; apply + regen types**
      - `20240221000000_studio_crm.sql` (team_members + contacts): **new; apply + regen types**
      - `20240222000000_contacts_backfill.sql` (auto-link + backfill contacts): **new; apply**
      - `20240223000000_campaigns.sql` (marketing campaigns): **new; apply**
      - `20240224000000_automations.sql` (automation rules engine): **new; apply**
      - `20240225000000_agent_actions.sql` (agent action queue): **new; apply**
- [ ] **Grant yourself Studio access** (to load `/studio`): after applying, run
      `insert into public.team_members (profile_id, role) select id, 'owner' from public.profiles where handle = 'danieltyack';`
- [ ] **Configure the Resend webhook** (Phase 6.2): in the Resend dashboard add a
      webhook to `https://frequencylocal.com/api/webhooks/resend` for delivery/bounce/
      complaint events, and set `RESEND_WEBHOOK_SECRET` (the `whsec_…` value) in env.
      Without it the endpoint rejects all calls (so bounces won't auto-suppress).
- [ ] **Regenerate DB types** after applying (the new tables use an untyped client
      view until then): `npx supabase gen types typescript --linked > lib/database.types.ts`,
      then `npx tsc --noEmit`. Optional: once regenerated, drop the
      `as unknown as SupabaseClient` casts in `lib/engagement/*` for full typing.
- [ ] **Local sanity check**: `npm install` (if needed) → `npx tsc --noEmit`
      (should be clean) → `npm run dev` and load the app.

## 🟡 Verify the shipped UI changes (Phase 1 quick wins)
- [ ] **Grouped left nav**: Community / Connect, plus Progress (Crew) & Manage
      (Admin) when your role shows them. Check **desktop sidebar AND mobile
      drawer**. Confirm no nav item disappeared for your role.
- [ ] **"Interests"**: the nav label and the `/channels` page heading now say
      Interests (route + data unchanged).
- [ ] **In-person badge**: `/circles` cards show "📍 In person" only on
      in-person circles; virtual circles are unmarked; capacity line still shows
      "N / M members".

## 🟢 Product decisions (small, but yours)
- [ ] **One word or two?** App now says **Interests**; public `/discover` says
      **Topics**. Reconcile to one, or keep public=Topics / member=Interests.
- [ ] **The "tune in" verb**: keep it, or switch to "follow/join" now that the
      noun is Interests.
- [ ] **Reward economy** (Phase 3): point values per action; amounts are
      deferred (config later). The **currency model is now baked in**: gems =
      internal/web, zaps = external/in-person, zaps→gems at season end
      (`reset_season`), gems spend in the store. Two nuances to confirm:
      - **In-person events → zaps: DONE.** Hosting now awards zaps on event
        creation (`ZAP_AMOUNTS.event_host`). Attendance zaps are deferred to
        **verified check-in** (ROADMAP P2.13), *not* awarded on RSVP, which stays
        a gems web-action (RSVP-for-zaps would be gameable). Amounts in
        `lib/zaps.ts` are tunable placeholders.
      - **Conversion rate: keep rank-based** (luminary 1/1.5 … default 1/5):
        confirmed, no change.
- [ ] **Physical merch fulfillment**: store spends gems today; trading gems for
      physical merch needs `store_items` flagged physical + a fulfillment/shipping
      flow on `store_redemptions` (not built yet).
- [ ] **Physical rollout & safety** (Phase 3): who may place ghost nodes; partner
      business terms.
- [ ] **Web's long-term role** once mobile leads: full parity vs. lighter funnel.

## 🔧 Next build steps: remaining
**Shipped since this list was written:** inline circle admin by capability (host +
janitors + area guides/mentors); profile edit-in-place (owner via settings, janitor
inline moderator edit); all 3 page templates + Feed/Circles/Interests/Events/
Partners/Directory migrated onto them.

Still pending:
- [ ] **Module slot registry** + make the right rail **scope-aware**
      (global → circle/interest) per PAGE-FRAMEWORK §4.
- [ ] **Phase 2 authz:** migrate high-traffic read paths to RLS + RPCs; `getFeed`
      view-builder; RLS policy tests. (Sensitive: incremental + tested.)
- [ ] Crew **task volunteering** inline on circle pages (needs the task-assignment
      data model confirmed: `crew_tasks` is currently a type catalog only).
- [ ] **Phase 6 remainder:** live Claude operator for the Agent (gated on more spine
      tests); Segments builder + Pipelines; 6.7 Inbox.

## 🧹 Pre-existing tech debt: ✅ resolved (verified 2026-06-02)
- [x] `right-sidebar.tsx` (at `components/sidebar/right-sidebar.tsx`): unused imports /
      gamification-widget `any` / unused `isHost`/`streaks`. **Clean** (`eslint` exit 0).
- [x] `admin/actions.ts` & `broadcast/actions.ts`: `no-explicit-any`. **Clean**. The repo-wide
      `no-explicit-any` debt noted in `LAUNCH.md §7` has been cleared; `eslint .` reports 0 problems.

## 📌 Then: Phases 2 to 5
Per [BUILD-PHASES.md](BUILD-PHASES.md): Phase 2 (authz → RLS+RPC view models),
Phase 3 (gamification event ledger + physical-trigger infra), Phase 4 (scale
hardening, as metrics demand), Phase 5 (Expo/RN mobile on the proven contract).
