# Patch list — final meta-scan (admin surfaces · control boards · member features)

> Read-only bug + gap audit of every wired admin/operator surface and the full member-facing
> app (2026-07-02), adversarially verified, then fixed. **Headline: the money/economy, privacy, and
> auth-guard paths were already unusually well-hardened**; the holes were a data-integrity race, two
> economy double-awards, a few authz-axis mismatches, and a broad "silent write failure / optimistic-UI
> lie" class. **All P0/P1/P2 items below are now fixed** except a short, explicitly-scoped remainder.

Legend: ✅ fixed · ⏳ open (documented) · 🔵 owner-only (dashboard/console)

## ✅ P0 — data-integrity / economy / privacy (shipped)

- **Private journey draft leak** — `app/(main)/journeys/[slug]/learn/page.tsx`: added the visibility gate the detail page has (private → author-only).
- **Duplicate Starter Circle on re-accept** — `lib/applications/handoff.ts`: claim-then-effect (stamp `accepted` conditional on prior status before `runAcceptHandoff`; abort on failed/lost claim).
- **Crew-task double-award race** — advisory-lock RPC `log_crew_completion_atomic` (migration `20261008000000`, applied to prod, SECURITY DEFINER + service_role-only); `logCompletion` rewired. Handles repeatable tasks; inserts at most once for non-repeatable so the trigger fires once.
- **Expression-Challenge double-pay** — `lib/quest/expression.ts`: Zap path now on a `reward_grants` claim-then-pay (the real atomic lock), mirroring the Gem path.
- **Stranded extra-credit bonus** — `lib/journeys/grants.ts`: releases its claim on a failed award so a retry pays.

## ✅ P1 — operator-blocking authz-axis + correctness (shipped)

- **Support console staff gate** — `admin/support/actions.ts`: `requireAgent` gained the staff-`members` arm (mirrors `resolveModerator`).
- **Connection settings axis** — `lib/connections/connection-settings-actions.ts`: `saveConnectionSettings` now gates on the staff axis (`isStaff(webRole)`) — unblocks Site Admins AND closes the over-permissive legacy-`community_role='admin'` path.
- **Gamification award guard** — `crew/gamification-actions.ts`: `award/revokeAchievement` additionally admit a community-domain staffer (mirrors the page gate), fail-closed.
- **Member manager controls** — `admin/member-manager.tsx` + `admin/page.tsx`: role/deactivate controls now render only for janitors (`canManage` prop) and surface action errors inline.
- **Broadcasts audience axis** — `admin/dispatches/page.tsx`: staff standing now derives from `web_role` (list + audience branch fixed in lockstep).
- **Daily check-in timezone** — `checkin-actions.ts` + `components/daily-check-in.tsx`: uses `resolveMemberDay` (member-local day, DST-safe yesterday) instead of UTC; client passes its tz.
- **DM optimistic-send** — `components/messages/thread.tsx`: wraps `sendMessage` in try/catch, rolls back the optimistic bubble, restores the draft, surfaces an error.
- **DM realtime publication** — verified a **non-issue**: `messages` and `room_messages` are both in the prod `supabase_realtime` publication (only the migration comment was stale).

## ✅ P2 — silent-failure / optimistic-lie class (shipped)

- **Member:** feed `createPost`/`createReply` (→ ActionResult + composer keeps text on failure), `joinCircle` (→ ActionResult + new `JoinCircleButton`), channels tune-in/out, `submitToLibrary`, `startConversation`, broadcast comments (renders immediately) + like/vote, friend/block buttons, friend-actions revalidate-by-handle, messages header badge (now includes room unread), "message my circle" pre-filters to friends.
- **Admin:** the four entity-settings-module saves + hubs/nexuses clients (try/catch + inline error), marketing `sendCampaign` (aborts on insert error) + campaign-composer confirm-with-audience, `bulkSetContactConsent`/`updateContactFields`, agent `approve/dismiss`, `toggleRule`, qr `updateCampaign`, `setReferralLanding`, walkthrough create/seed, loom-rail inline error.
- **Marketplace writes** — `lib/marketplace.ts` + `market/actions.ts`: throw + surface `fail()`.

## ✅ Threads closed (T)

- ✅ **Messages unread + last-message under-count** — new window RPC `dm_conversation_summaries` (migration `20261010000000`, per-conversation LATERAL joins, `auth.uid()`-scoped, applied to prod + verified against a manual computation) replaces the shared `limit(convIds*20/10)` budget on both the inbox (`messages/page.tsx`) and the nav popover (`popover-actions.ts`) — no more busy-thread starvation.
- ✅ **DM optimistic-vs-realtime dedup** — `components/messages/thread.tsx`: the realtime handler now replaces my own optimistic placeholder (`optimistic-*`) with the real row instead of appending, so a sent DM no longer double-renders.
- ✅ **Funnel builder remove-link** — `admin/growth/funnels/[id]/builder-client.tsx`: `removeStageLink` result checked; failures surface inline.

## ⏳ Open — explicitly scoped remainder

- **Systemic "fire-and-refresh"** — a shared `isError`+`setError` hook would close the long tail of admin toggle handlers (`inline-text.tsx`, `circles-client.tsx`, `qr-studio.tsx`, marketing `*-client` toggles) that spin without surfacing a failure. Deferred: a broad UX-polish refactor, best done as its own reviewed pass.

## Product confirm — RESOLVED

- ✅ **Verification vs Zaps** — decided (owner): verification GATES the Zaps. Shipped as ADR-499 (per-task, held-then-released; leader grant releases; timer/location/code auto-methods documented as follow-up). Migration `20261009000000`.

## 🔵 Owner-only (from the broader scan — dashboard/console, can't be done from code)

- Enable **leaked-password protection** (Supabase → Auth).
- Verify/disable the **enabled-but-unused anonymous sign-ins** (Supabase → Auth).
- Submit **`sitemap.xml`** to Google Search Console + Bing.

## ⚠️ Not fully swept (lighter coverage, no defects surfaced)

Admin CRM deal-CRUD forms / pipeline drag-drop / playbooks; marketing nurture/deliverability/variants interiors; the editor-heavy surfaces (menu/appearance/theme-studio/walkthrough/page-layout/segments/store-item); member `programs`, `journal`, `orders` detail, global `search`, QR short-links.
