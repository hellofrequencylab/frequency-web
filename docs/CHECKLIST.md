# Owner checklist — what to verify & decide (when you're at a computer)

> A running list of things only *you* can do (apply DB changes, eyeball UI, make
> product calls). The developer-side phase tracker is [BUILD-PHASES.md](BUILD-PHASES.md);
> this is the human action list. Work through it on the **test/dev side**, then
> promote to production when satisfied. Check items off as you go.

## 🔴 Blocking — do first
- [ ] **Apply the PostGIS migration** — review then run:
      `npx supabase migration list` → `npx supabase db push`
      (file: `supabase/migrations/20240214000000_enable_postgis_geography.sql`).
      Nothing geo works until this lands.
- [ ] **Local sanity check** — `npm install` (if needed) → `npx tsc --noEmit`
      (should be clean) → `npm run dev` and load the app.

## 🟡 Verify the shipped UI changes (Phase 1 quick wins)
- [ ] **Grouped left nav** — Community / Connect, plus Progress (Crew) & Manage
      (Admin) when your role shows them. Check **desktop sidebar AND mobile
      drawer**. Confirm no nav item disappeared for your role.
- [ ] **"Interests"** — the nav label and the `/channels` page heading now say
      Interests (route + data unchanged).
- [ ] **In-person badge** — `/circles` cards show "📍 In person" only on
      in-person circles; virtual circles are unmarked; capacity line still shows
      "N / M members".

## 🟢 Product decisions (small, but yours)
- [ ] **One word or two?** App now says **Interests**; public `/discover` says
      **Topics**. Reconcile to one, or keep public=Topics / member=Interests.
- [ ] **The "tune in" verb** — keep it, or switch to "follow/join" now that the
      noun is Interests.
- [ ] **Reward economy** (Phase 3) — point values, what each action/QR/NFC/ghost
      node pays, season resets. Game-design, not engineering.
- [ ] **Physical rollout & safety** (Phase 3) — who may place ghost nodes; partner
      business terms.
- [ ] **Web's long-term role** once mobile leads — full parity vs. lighter funnel.

## 🔧 Next build steps — need the app running (do together / with QA)
These have **foundations already built & committed** (capability resolver,
`<Can>`, `DetailTemplate`, `ModuleCard`, contract types) — they just need wiring
+ visual QA, which is why I held them:
- [ ] Wire `getCircleCapabilities` into the **circle page** → inline host actions
      via `<Can need="circle.editSettings">` etc. (replaces ad-hoc `isHost`).
      ⚠️ Decide intended behavior: should **janitors** see inline host actions on
      *any* circle? (The resolver currently grants it; today's UI shows it only to
      the circle's host.)
- [ ] Wire `getProfileCapabilities` into the **profile page** → "Edit profile" /
      edit-in-place via `<Can need="profile.edit">`.
- [ ] Build **Stream** + **Index** template shells; migrate `/feed` and
      `/circles` onto the templates (Detail shell already exists).
- [ ] **Module slot registry** + make the right rail **scope-aware**
      (global → circle/interest) per PAGE-FRAMEWORK §4.
- [ ] Crew **task volunteering** inline on circle pages (needs the task-assignment
      data model confirmed — `crew_tasks` is currently a type catalog only).

## 🧹 Pre-existing tech debt (noticed, not mine to silently change)
- [ ] `right-sidebar.tsx` — unused imports (`CalendarDays`, `Trophy`, `Target`),
      `any` types in the gamification widget, unused `isHost`/`streaks`.
- [ ] `admin/actions.ts` & `broadcast/actions.ts` — `no-explicit-any` lint errors.
      (None block `tsc`; clean up when convenient.)

## 📌 Then: Phases 2–5
Per [BUILD-PHASES.md](BUILD-PHASES.md): Phase 2 (authz → RLS+RPC view models),
Phase 3 (gamification event ledger + physical-trigger infra), Phase 4 (scale
hardening, as metrics demand), Phase 5 (Expo/RN mobile on the proven contract).
