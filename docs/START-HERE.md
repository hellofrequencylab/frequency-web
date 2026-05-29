# START HERE — go-live runbook & development continuation

**State:** branch `claude/website-feature-strategy-VM0sn`, fully pushed, `tsc`
clean. All work this session is **additive** — your running app is unchanged
until you apply the migrations below. Work top to bottom; each step has a
**✅ verify** gate. Detail lives in [CHECKLIST.md](CHECKLIST.md) (decisions +
tech debt) and [BUILD-PHASES.md](BUILD-PHASES.md) (phase tracker).

---

## PART A — Get it running (do in order)

### 1. Get the branch
```bash
git fetch origin claude/website-feature-strategy-VM0sn
git checkout claude/website-feature-strategy-VM0sn
git pull origin claude/website-feature-strategy-VM0sn
npm install
```
**✅ verify:** `git log --oneline -1` shows `Phase 3: partner directory read layer`.

### 2. Review the 6 new SQL migrations  ⚠️ read before applying
These were written **without a live DB to test against**, so skim each one. They
**must apply in this order** (PostGIS first — others depend on it). All are
additive (new tables/columns only; nothing dropped or altered destructively).

| # | File | Creates | Eyeball for |
|---|------|---------|-------------|
| 1 | `20240214000000_enable_postgis_geography.sql` | PostGIS extension + `circles.geog` | extension enables on your plan |
| 2 | `20240215000000_engagement_events.sql` | event ledger (idempotency, source) | RLS read-own policy |
| 3 | `20240216000000_physical_nodes.sql` | `nodes` + `captures` + `node_within_range()` | nodes have **no** client read policy (intended) |
| 4 | `20240217000000_node_zaps_value.sql` | `nodes.zaps_value` column | — |
| 5 | `20240218000000_partners_module.sql` | `partners` + `partner_offers` + `partner_redemptions` + `nodes.partner_id` | public-read-when-active policies |
| 6 | `20240219000000_notification_queue.sql` | durable job queue | service-role only (no policies) |

### 3. Apply migrations
```bash
npx supabase migration list      # confirm these 6 are pending
npx supabase db push
```
**✅ verify:** `npx supabase migration list` shows all 6 as applied; no errors.

### 4. Regenerate DB types  (required — new tables aren't typed yet)
```bash
npx supabase gen types typescript --linked > lib/database.types.ts
npx tsc --noEmit
```
**✅ verify:** `tsc` exits clean. (It was clean before regen too — the new code
uses temporary untyped views; this swaps in real types.)

### 5. Drop the temporary casts (recommended, ~5 min)
Now that the tables are typed, in each file below replace
`createAdminClient() as unknown as SupabaseClient` with plain `createAdminClient()`
and delete the now-unused `import type { SupabaseClient }` line. Re-run `tsc` after
each — it'll flag any column mismatch for you:
- `lib/engagement/events.ts`
- `lib/engagement/verify.ts`
- `lib/engagement/capture.ts`
- `lib/queue/outbox.ts`
- `lib/partners/read.ts`

**✅ verify:** `npx tsc --noEmit` clean, `grep -rn "as unknown as SupabaseClient" lib` empty.

### 6. Full sanity
```bash
npx tsc --noEmit && npm run lint && npm run build
```
**✅ verify:** build succeeds. (Pre-existing lint warnings in `right-sidebar.tsx` /
`admin` / `broadcast` are noted in CHECKLIST tech-debt — not blockers.)

### 7. Run it & QA the 3 visible Phase-1 changes
```bash
npm run dev
```
- **Grouped nav** (desktop sidebar + mobile drawer): Community / Connect, plus
  Progress (Crew) / Manage (Admin) for your role — nothing missing.
- **"Interests"** label + `/channels` page heading.
- **"📍 In person"** badge on in-person `/circles` cards only.

> The Phase-3 backbone (ledger, nodes, verifier, queue, partners) is **server-only
> and not wired to UI yet** — there's nothing to click. It's infrastructure ready
> for the wiring in Part B. The queue cron (`/api/cron/process-queue`, every 2 min)
> is live but idle until something enqueues.

**✅ GATE:** once Part A passes, you're ready to promote to prod when you choose,
and we can continue development.

---

## PART B — Continue development (priority order)

### B1. Wire the live pieces  *(needs the app running — do with me, QA each)*
1. **Inline admin via capabilities** — wire `getCircleCapabilities` into the circle
   page (`<Can need="circle.editSettings">`) and `getProfileCapabilities` into the
   profile page (edit-in-place). **One decision first:** should **janitors** see
   inline host actions on *any* circle? (resolver grants it; today's UI shows it
   only to the host.)
2. **Templates** — migrate `/feed` + `/circles` onto Stream/Index shells (Detail
   shell already built).
3. **Partner directory UI** — render `listActivePartners` / `getPartnerView`.
4. **Realtime reward feedback** (Supabase Broadcast).

### B2. Authz hardening — Phase 2 RLS  *(sensitive — incremental + tested)*
Migrate high-traffic read/write paths from admin-client → RLS + RPCs; add the
`getFeed` view-builder. Do a few paths at a time with policy tests; don't big-bang.

### B3. Small follow-ups (mostly additive)
- Redemption-on-capture flow (bump plaque → discount + zaps).
- Repeatable-node idempotency keying (`captureNode`).
- Migrate inline email/push sends onto the `notification_queue`.
- Event **attendance check-in** (ROADMAP P2.13) → award attendance zaps there.

### B4. Product decisions still open (from CHECKLIST)
- "Interests" vs the public `/discover` "Topics" wording; the "tune in" verb.
- Reward **amounts** (gem/zap values per action; `ZAP_AMOUNTS`, `nodes.zaps_value`).
- Physical-merch fulfillment (store flag + shipping flow).
- Ghost-node placement policy & partner business terms.

### Later
- **Phase 4** scale hardening — *as metrics demand*.
- **Phase 5** mobile (Expo/RN) on the proven contract (`lib/contract`).
