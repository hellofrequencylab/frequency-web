# Patch list — final meta-scan (admin surfaces · control boards · member features)

> Read-only bug + gap audit of every wired admin/operator surface and the full member-facing
> app (2026-07-02), adversarially verified. **Headline: the money/economy, privacy, and auth-guard
> paths are unusually well-hardened** (atomic RPCs, claim-then-pay reversal, owner-scoped reads,
> no unguarded admin mutation, no dead controls). The holes are a data-integrity race, a few
> authz-axis mismatches that block the operators a console serves, and a broad "silent write
> failure / optimistic-UI lie" class. This is the durable to-do; check items off as they land.

Legend: ✅ fixed this session · 🔴 P0 (data/economy/privacy, pre-launch) · 🟠 P1 (operator-blocking / correctness) · 🟡 P2 (silent-failure / UX polish)

## ✅ Fixed this session (shipped in the final-scan PRs)

| Fix | File | What |
|---|---|---|
| Journey draft leak | `app/(main)/journeys/[slug]/learn/page.tsx` | Added the visibility gate the detail page has — a private draft is now author-only (was readable by any member). |
| Duplicate Starter Circle | `lib/applications/handoff.ts` | Reordered to claim-then-effect: stamp `accepted` (conditional on prior status) BEFORE `runAcceptHandoff`, abort on a failed/lost claim — closes the re-accept duplicate. |
| Stranded extra-credit bonus | `lib/journeys/grants.ts` | `grantExtraCreditZaps` now releases its `reward_grants` claim when the award fails, so a retry can pay. |
| Marketplace silent "Saved" | `lib/marketplace.ts` + `app/(main)/market/actions.ts` | `updateListing`/`setListingStatus`/`deleteListing` throw on error; the actions catch → `fail()` (mirrors the `lib/commerce/products.ts` fix). |
| Support console unusable for staff | `app/(main)/admin/support/actions.ts` | `requireAgent` gained the staff-`members` arm (mirrors `resolveModerator`) — matches the page gate. |
| Gift Gems policy + notify | `lib/rewards/gifts.ts` + docs | Open to all members; recipient now notified (ADR-498). |

## 🔴 P0 — economy integrity (need a migration; fix before launch)

- **Crew-task completion double-award race** — `app/(main)/crew/actions.ts:25-45` (`logCompletion`). No unique constraint on `crew_completions(task_id, profile_id)`; the `after_crew_completion` trigger credits `current_season_zaps` + advances rank on EVERY insert, so two concurrent completions double-credit (client `useTransition` only stops single-client double-clicks). **Fix:** partial unique index `(task_id, profile_id)` where non-repeatable + `ON CONFLICT DO NOTHING` (or route through `recordEngagementEvent` idempotency). Circle tasks share this path.
- **Expression-Challenge Zap double-pay** — `lib/quest/expression.ts:97-131`. Non-atomic `wasDone` guard instead of a `reward_grants` claim → concurrent double-submit double-pays. **Fix:** claim-then-pay `reward_grants` row keyed on `(challenge, profile)` (mirror C4/C5).

## 🟠 P1 — operator-blocking authz-axis + correctness

- **Connection settings save wrong axis** — `lib/connections/connection-settings-actions.ts:17,134`. `saveConnectionSettings` gates on `community_role` 'admin' while the page gates the staff axis → Site Admins blocked on Save; also over-permissive (a legacy `community_role='admin'` non-staff can invoke it directly). **Fix:** gate on the staff axis (`isStaff(webRole)` / `authorizeAction`).
- **Gamification award guard mismatch** — `app/(main)/admin/gamification/page.tsx:55` vs `app/(main)/crew/gamification-actions.ts:265`. Page admits `{staff:'community'}`; `awardAchievement`/`revokeAchievement` check `community_role` only → a community-domain staffer gets Unauthorized. **Fix:** accept the `community` capability (mirror `authorizeAction`).
- **Member manager dead controls** — `app/(main)/admin/member-manager.tsx:52-63`. Role dropdown + deactivate render under `requireAdminFloor` (any staff) but `assignRole`/`deactivateMember` are janitor-only → non-janitor sees enabled controls that throw silently. **Fix:** gate control visibility on `isJanitor` + surface the error.
- **Broadcasts audience axis** — `app/(main)/admin/dispatches/page.tsx:11`. `isStaff` derived from `community_role` not `web_role` → a staff admin with `community_role='member'` gets no audience options. **Fix:** derive from `webRole`/`staffRole`.
- **Daily check-in uses UTC day, not member-local** — `app/(main)/checkin-actions.ts:13-15,37,41`. Streak/reward keyed to the UTC calendar day; evening-PT members double-fire or skip (LA-home tz theme). **Fix:** thread `clientTimezone` and use `resolveMemberDay` (member-local today AND yesterday), matching `lib/practices.ts`.
- **DM optimistic-send lies on failure** — `components/messages/thread.tsx:93-114`. Optimistic append + clear, then `await sendMessage` with no try/catch; `sendMessage` throws on block / no-ops on non-participant. **Fix:** try/catch, roll back the optimistic row, surface an error (mirror `room-thread.tsx`).
- **DM realtime never enabled in a migration** — `supabase/migrations/20240103000000_direct_messages.sql:100-108` leaves `ALTER PUBLICATION supabase_realtime ADD TABLE messages` commented out (rooms ARE added). **Fix:** verify the live publication, add `messages` in a migration, and reconcile the optimistic id vs realtime dedup (currently `optimistic-${Date.now()}` → duplicate bubbles once live).

## 🟡 P2 — silent-failure / optimistic-lie / stale-cache class

**Member app** — surface failures (return `ActionResult` + render) instead of `console.error`+return:
- `app/(main)/feed/actions.ts:127-140,208-215` — `createPost` / `createReply` drop the post/reply + clear the composer on a failed insert.
- `app/(main)/circles/actions.ts:42-89` — `joinCircle` silent no-op on every path (incl. the F2 cap trigger).
- `app/(main)/channels/actions.ts:99-129` — `tuneInChannel`/`tuneOutChannel` don't check the upsert error.
- `app/(main)/library/actions.ts:64,68` — `submitToLibrary` returns success even if the status update failed.
- `app/(main)/messages/actions.ts:69-74` — `startConversation` ignores the participant-insert error before redirect (conversation with no participants).
- `components/.../broadcast/[id]/comment-section.tsx:31,37-51` — posted comment never renders (frozen `initial` state) → re-submit dupes.
- `app/(main)/broadcast/actions.ts:161-181,216-252` — like/vote optimistic UI lies on a swallowed error.
- `app/(main)/people/[handle]/friend-button.tsx` + `block-button.tsx` — swallow the `ActionResult` (no error shown; `router.refresh()` masks it).
- `app/(main)/people/friend-actions.ts:77,110,147,166` — revalidate `\`/people/${uuid}\`` but the route is `/people/[handle]` → target's page stays stale on soft-nav. **Fix:** revalidate by handle (as `people/[handle]/actions.ts:41` does).
- `app/(main)/messages/page.tsx:288` — header badge counts DMs only; nav popover counts rooms+DMs → the two disagree.
- `messages/page.tsx:217-223` + `popover-actions.ts:124-129` — shared message budget (`limit(convIds*20/10)`) lets a busy thread starve others → `lastMessage=null`/`unread=0`. **Fix:** newest-per-conversation window RPC.
- `components/messages/crew-lead-quick-action.tsx:41-64` — "Message my circle" dead-ends behind `startGroupConversation`'s all-invitees-must-be-friends rule. **Fix:** exempt circle co-members or pre-filter.

**Admin app** — the same class, plus the systemic pattern:
- Entity settings save swallow — `components/admin/modules/{channel,circle,hub,nexus}-settings-module.tsx` (no try/catch, unconditional "Saved"; the actions throw). `hubs-client.tsx:155` / `nexuses-client.tsx:143` same.
- Marketing writes report success on failure — `campaigns/actions.ts:61-65` (sends anyway, no record), `contacts/actions.ts:41-46,76-88` (bulk-consent + updateContactFields lie), `agent/actions.ts:31-46` (approveAction executes even if the status write failed), `automations/actions.ts:142-148` (`toggleRule` void swallow), `qr/campaign-actions.ts:121-126` (code-set diff), `onboarding-controls/actions.ts:57-63` (QR retarget), `walkthroughs/actions.ts:92,138` (create/seed silent), `growth/funnels/[id]/builder-client.tsx:173-178` (remove link).
- **Mass campaign send has no confirmation** — `admin/marketing/campaigns/campaign-composer.tsx:30-42` blasts the whole segment on click. **Fix:** confirm with the resolved audience size.
- **Systemic "pending state, no error surface"** — many client controls `await` an action, discard the failure, and just `router.refresh()`/spin: `circles-client.tsx`, `qr/qr-studio.tsx`, `components/admin/inline/inline-text.tsx` (shared inline-edit — broad blast radius), and the marketing `*-client.tsx` toggle handlers. **Fix:** adopt the shared `isError`+`setError` pattern (`moderation-queue.tsx` / `danger-delete.tsx` do it right); consider a small shared hook.
- `admin/library/loom-rail.tsx:96,106,115` — `window.alert(res.error)`; functional but off-pattern → inline error.

## Product confirm (not a bug)

- **Verification vs Zaps** — `app/(main)/crew/actions.ts:35-40` writes `zaps_earned` at completion regardless of `requires_verification`; `approveVerification` (`admin/actions.ts:854`) only stamps `verified_by` (never awards). Verification reads as a moderation flag over a projection, not a reward gate. Confirm the intended semantics.

## ⚠️ Not fully swept (recommend a follow-up pass)

- Prod check: is `messages` in the `supabase_realtime` publication (P1 above)? Not captured in migrations.
- Lighter coverage (spot-checked, no defects surfaced): admin CRM deal-CRUD forms / pipeline drag-drop / playbooks, marketing nurture/deliverability/variants interiors, the editor-heavy surfaces (menu/appearance/theme-studio/walkthrough/page-layout/segments/store-item), and member `programs`, `journal`, `orders` detail, global `search`, QR short-links.
