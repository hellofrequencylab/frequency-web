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

## ✅ Fire-and-refresh / silent write-failure (shipped)

- **Admin toggle/save handlers now surface failures** — the long tail of fire-and-forget handlers that spun (or silently reverted on refresh) with no error now show an inline `role="alert"` (`text-danger`) and preserve/restore state on failure: `components/admin/inline/inline-text.tsx` (throw-based save), `admin/circles/circles-client.tsx` (`updateCircle`/`archiveCircle`; editor stays open on failed save), `admin/qr/qr-studio.tsx` (`setNodeActive`/`deleteNode`), and the marketing `*-client` toggles — `nurture-client.tsx` (create/toggle sequence, step toggle/remove), `funnels-client.tsx` (campaign archive), `funnels/[id]/detail-client.tsx` (rename/archive/owner reassign), `funnels/variants/[codeId]/variants-client.tsx` (variant toggle/remove). No shared hook: each file already carried its own inline `error` convention and a distinct success path, so the pattern was inlined per component (throw → try/catch; `ActionResult` → `'error' in res`). Success paths preserved byte-for-byte; toggles render from server props so no false optimistic rollback.

## ✅ Systematic six-dimension audit (2026-07-02) — fixes shipped

Read-only sweep of coherence · wiring · surface controls · SEO/AIO · speed · security, adversarially verified. Security/webhooks/cron/OAuth were found genuinely well-hardened; wiring + speed largely clean. Fixed:

- ✅ **CRM auth on the wrong axis (P1, security/coherence)** — `admin/crm/actions.ts` `requireCrm` gated on the community ladder (`atLeastRole(community_role,'host')`) for RLS-bypassing `crm_*` writes, so it **locked out Executive Admins** (`web_role=janitor`, `community_role=member`) *and* admitted non-staff community hosts. Rewired to the staff axis (`authorizeAction(caller,'janitor')`, ADR-208), matching the CRM pages. Same wrong axis fixed on the read pages: `crm/deals/[id]/page.tsx` → `requireAdmin('janitor')`; `crm/contacts/page.tsx` → staff-axis gate + the full-roster branch (which was keyed on the **retired** community `admin`/`janitor` enum values, so it was dead) now keys on `isStaff(webRole)`, via the view-as-aware `getCallerProfile`.
- ✅ **`/events` index had no `rel=canonical` (P2, SEO)** — its 9 filter facets were each an indexable duplicate. Added a self-canonical to `lib/page-content.ts` `pageContentMetadata` (fixes `/events` and is harmless on the noindex in-app pages that share the helper).
- ✅ **`deleteRule` fire-and-forget (P2, wiring)** — `admin/marketing/automations/automations-table.tsx` now surfaces a failed delete inline via a `DeleteCell` mirroring the fixed `ToggleCell`.

### ⚠️ Flagged (need a decision, NOT auto-fixed)
- **App-overrides global scope is a no-op (P2, surface control)** — at the default "Every page" scope, personal ("You") apps never pass through `applyOverrides` (`components/layout/settings-panel.tsx`), so an operator can disable/reorder/floor any App, see "Saved", and nothing changes for any viewer. This is the **other agent's** just-merged Phase 6 feature, and the fix changes member-facing behavior (a global override would then hide a member's own app), so it needs their/owner confirmation before touching.
- ✅ **Stripe dual-webhook, one secret (P2, ops) — RESOLVED (ADR-506)** — the two routes were consolidated into ONE endpoint (`/api/webhooks/stripe`) that dispatches every event type (Connect `account.updated`, memberships/subscriptions, tips, tickets, commerce, dues, refunds) under a single `STRIPE_WEBHOOK_SECRET` and a single idempotency claim. `/api/stripe/webhook` was deleted. No more dropped reconciliations from a split. **Owner action still required:** configure ONE endpoint in the Stripe dashboard pointing at `https://frequencylocal.com/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET` to that endpoint's `whsec_…`.

## Product confirm — RESOLVED

- ✅ **Verification vs Zaps** — decided (owner): verification GATES the Zaps. Shipped as ADR-499 (per-task, held-then-released; leader grant releases; timer/location/code auto-methods documented as follow-up). Migration `20261009000000`.

## 🔵 Owner-only (from the broader scan — dashboard/console, can't be done from code)

- Enable **leaked-password protection** (Supabase → Auth).
- Verify/disable the **enabled-but-unused anonymous sign-ins** (Supabase → Auth).
- Submit **`sitemap.xml`** to Google Search Console + Bing.

## ⚠️ Not fully swept (lighter coverage, no defects surfaced)

Admin CRM deal-CRUD forms / pipeline drag-drop / playbooks; marketing nurture/deliverability/variants interiors; the editor-heavy surfaces (menu/appearance/theme-studio/walkthrough/page-layout/segments/store-item); member `programs`, `journal`, `orders` detail, global `search`, QR short-links.
