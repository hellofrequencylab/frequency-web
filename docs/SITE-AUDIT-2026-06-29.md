# Site Audit — 2026-06-29 (clean-start sweep)

> A full read-only scan across **bugs/wiring · performance · SEO-AIO · security**, plus a lint
> baseline and the dead-link sweep, run to give a clean starting point. **Bottom line: the
> codebase is mature and healthy.** No broken links, lint-clean (2 trivial test warnings), strong
> security posture (a CI authz-guard checker is in place), top-tier SEO infra. The real work is a
> small set of concrete fixes below, organized so tomorrow starts from a known-good baseline.
>
> **Status legend:** ✅ fixed (this sweep) · 🔧 fixing now · 📋 triaged to backlog · ✓ verified clean.
> **Method:** 4 parallel audit agents over the repo + `pnpm lint` + a route-graph dead-link scan.

---

## 1. Executive summary

| Dimension | Verdict | Headline |
|---|---|---|
| **Bugs / wiring** | 🟢 Healthy | One unreachable feature (`event-warm-proof`); a cluster of dead exports; no logic bugs; **0 broken links**. |
| **Performance** | 🟢 Healthy | Hot pages already batched; a handful of real N+1 loops in `lib/studio/*` + two Detail layouts that serial-await. |
| **SEO / AIO** | 🟢 Excellent | Full infra (sitemap, robots+AI rules, JSON-LD library, per-entity OG, canonicals). Refinements only. |
| **Security** | 🟢 Strong | One HIGH IDOR (`inviteToRoom`); a few MED input-bounds / report-target bindings; no secret leak, XSS, open redirect, or privilege escalation. |
| **Lint / types** | 🟢 Clean | `pnpm lint` = 0 errors, 2 unused-var warnings in one test; `tsc` clean; 2463 tests pass. |

---

## 2. Security (priority order)

| ID | Finding | File | Sev | Status |
|---|---|---|---|---|
| SEC-1 | **IDOR** — any room member can force-add an arbitrary user into a private room via the admin client (no invitee consent/scope check). | `app/(main)/messages/rooms/actions.ts:278` (`inviteToRoom`) | 🔴 high | 🔧 |
| SEC-2 | `sendMessage` body + group/rename names only `.trim()`ed, no max length → DB bloat/abuse. | `app/(main)/messages/actions.ts:79,177,213` | 🟠 med | 🔧 |
| SEC-3 | `warnMember`/`suspendMember`/`cancelEventFromReport` don't bind the acted-on id to the report's actual target → a host can act on any id via any open report. | `app/(main)/feed/report-actions.ts:174,263,304` | 🟠 med | 🔧 |
| SEC-4 | `reportContent` writes a moderation report for an arbitrary `(type,id)` with no existence/visibility check → queue abuse. | `app/(main)/feed/report-actions.ts:19` | 🟠 med | 🔧 |
| SEC-5 | `joinRoom` self-joins a circle/hub/nexus/channel-scoped room without a scope-membership check. | `app/(main)/messages/rooms/actions.ts:108` | 🟡 low-med | 🔧 |
| SEC-6 | `markOneRead` leans on RLS alone; add defensive `.eq('recipient_id', profileId)`. | `app/(main)/notifications/actions.ts:46` | 🟡 low | 🔧 |
| SEC-7 | `buildContactPatch` caps no free-text field lengths. | `lib/crm/contact-fields.ts:40` | 🟡 low-med | 🔧 |
| SEC-8 | `setFoundingMember` doesn't UUID-validate `profileId` (diverges from economy/spotlight). | `app/(main)/admin/pricing/actions.ts:134` | 🟡 low | 🔧 |
| SEC-9 | `event.ics` returns title/venue/description for hidden/cancelled events to anyone with the slug. | `app/events/[slug]/event.ics/route.ts:60` | 🟡 low | 📋 (decide intent) |
| SEC-10 | `searchMembersToLink` builds a PostgREST `.or()` string from input; prefer parameterized `.ilike()`. | `app/(main)/connections/actions.ts:382` | 🟡 low | 📋 |
| — | **Verified clean:** all `lib/spaces/*`, `/admin` role/economy/pricing/persona/marketing actions, view-as impersonation, event/circle/people-admin resolvers; no secret in client/NEXT_PUBLIC; no exploitable XSS/open redirect; crons secret-gated; webhooks signature-verified. | — | ✓ | ✓ |

---

## 3. Bugs / wiring

| ID | Finding | File | Sev | Status |
|---|---|---|---|---|
| BUG-1 | **Unreachable feature** — `event-warm-proof` is bound + has metadata + its data is computed in `active-event.ts`, but it's in no route set or default layout, so it can never render (or be added from the editor). | `lib/widgets/modules.ts` (`EVENT_DETAIL_MODULE_IDS`), `lib/page-settings/default-layouts.ts` | 🔴 high | 🔧 |
| BUG-2 | No test asserts "every bound component is route-reachable or explicitly parked" — that's why BUG-1 slipped through. | `lib/widgets/modules.test.ts` | 🟠 med | 🔧 |
| BUG-3 | Dead `NavItem.comingSoon` field — defined + documented but never assigned or read. | `lib/nav-areas.ts:50` | 🟡 low | 🔧 |
| BUG-4 | **Dead exported server actions** (zero refs, verified by grep): legacy journey "plan" API (`createPlanAction`…`publishPlanAction`, `completeLessonAction`, `removeJourneyStep/Lesson`, `reorderJourneySteps`), `deleteDemoMembers`, `resetTypeFunctionDefault`, `joinChannel`/`leaveChannel` (superseded by tune-in/out), `inviteContact`, `getPersonAdminData`, `areFriends`, `getReports`, `getMemberReportCount`, `markConversationRead`, `getCircleTextDefaultForEditor`, `updateSpaceEmailTemplate`, `setEventRsvpMuted`. | various | 🟡 low | 🔧 (safe removals) |
| BUG-5 | **Missing connection** — `updateCircleField` (circle inline-edit) is built but never wired, unlike the parallel `updateEventField`. | `app/(main)/circles/admin-actions.ts:246` | 🟡 low-med | 📋 (wire the inline editor) |
| BUG-6 | Unwired "Draft with Vera" for offering blurbs (`draftOfferingBlurbAction`), while sibling bio/tagline drafters are wired. | `app/(main)/spaces/copilot-actions.ts:62` | 🟡 low | 📋 |
| BUG-7 | Stripe Connect activation is stubbed (activation succeeds without the payment binding). | `app/(main)/partners/join/actions.ts:12`, `lib/personas.ts:71` | 🟠 med | 📋 (dormant until `billing_live`) |
| BUG-8 | Non-atomic season-capstone count (two concurrent completions can read stale `<3`); mitigated by re-read + idempotent lock. | `lib/quest/complete.ts:220` | 🟡 low | 📋 (SECURITY DEFINER RPC = migration) |
| BUG-9 | Member module pages lack a `loading.tsx` skeleton (degrade to blank sections, not skeletons). | `/lead`, `/friends`, `/journal`, `/people`, … | 🟡 low | 📋 (parity polish) |
| — | **Verified clean:** module registry triad consistent (`modules.test.ts` passes, 97 meta = 97 bindings); **0 dead internal links**; no FormData/object signature mismatches; no broken imports. | — | ✓ | ✓ |

> Note: `HeaderSidebarTemplate` / `TwoColumnTemplate` are documented kit shells (PAGE-FRAMEWORK §3 D/E) — intentional even if not yet consumed, so they are kept, not deleted.

---

## 4. Performance

| ID | Finding | File | Sev | Status |
|---|---|---|---|---|
| PERF-1 | N+1: per-member dupe-check query in a loop. | `lib/studio/agent.ts:82` | 🔴 high | 🔧 |
| PERF-2 | N+1: per-candidate consent read in a serial loop (`filterByConsent`). | `lib/studio/winback.ts:46` | 🔴 high | 🔧 |
| PERF-3 | N+1: `listCircleTasks(c.id)` per hosted circle. | `app/(main)/admin/crew-tasks/page.tsx:71`, `app/(main)/lead/crew-tasks/page.tsx:25` | 🟠 med | 🔧 |
| PERF-4 | `spaces/[slug]/layout.tsx` chains ~5 independent reads serially before the hero paints. | `app/(main)/spaces/[slug]/layout.tsx:145` | 🟠 med | 🔧 |
| PERF-5 | `readTagline`/`getSpaceVisibility` fetched twice (metadata + body) — wrap in `React.cache`. | `app/(main)/spaces/[slug]/layout.tsx` | 🟠 med | 🔧 |
| PERF-6 | `hubs/[slug]/page.tsx` serial-awaits caps/access/circles with **no Suspense anywhere**. | `app/(main)/hubs/[slug]/page.tsx:50` | 🟠 med | 🔧 |
| PERF-7 | Fold `getLocalActivity` into the feed's main `Promise.all`. | `app/(main)/feed/page.tsx:149` | 🟡 low | 🔧 |
| PERF-8 | N concurrent LLM `draftCardLines` per page load — cap concurrency / precompute. | `lib/ai/vera/today.ts:436` | 🟠 med | 📋 (needs care) |
| PERF-9 | Funnel-sequences list has no limit (per-row `resolveSequence` + QR render). | `app/(main)/pages/sequences/page.tsx:49` | 🟡 low | 📋 |
| PERF-10 | Recursive per-category inserts (admin write path). | `lib/menus/actions.ts:264` | 🟡 low | 📋 |
| — | **Verified clean:** no heavy client libs in bundles; `next/image` consistently dimensioned; `'use client'` kept at interactive leaves. | — | ✓ | ✓ |

---

## 5. SEO / AIO

| ID | Finding | File | Sev | Status |
|---|---|---|---|---|
| SEO-1 | Redirect chain `/demo → /how-it-works → /the-community` (two hops). | `app/(marketing)/demo/page.tsx` | 🟠 med | 🔧 |
| SEO-2 | No per-entity OG image on `/discover/circles/[id]` (siblings have one) + no Twitter image. | `app/discover/circles/[id]/` | 🟠 med | 📋 |
| SEO-3 | No per-entity OG image on `/discover/journeys/[slug]` (primary HowTo surface). | `app/discover/journeys/[slug]/` | 🟠 med | 📋 |
| SEO-4 | Confirm Article + FAQPage JSON-LD on the 4 marketing pillar pages. | `app/(marketing)/{loneliness,friendship-as-an-adult,how-to-build-community,life-after-the-feed}/` | 🟠 med | 🔧 (verify/add) |
| SEO-5 | Spotlight avatar/header `<img>` use `alt=""` on an indexable person page. | `components/spotlight/spotlight-view.tsx:58` | 🟡 low | 🔧 |
| SEO-6 | `organizationSchema` has no `sameAs` (social profiles) — E-E-A-T win. | `lib/jsonld.ts` | 🟡 low | 🔧 |
| SEO-7 | `/privacy` + `/terms` lack `alternates.canonical`. | `app/privacy`, `app/terms` | 🟡 low | 🔧 |
| SEO-8 | Spotlight lacks a branded OG card + Twitter block. | `app/spotlight/[handle]/` | 🟡 low | 📋 |
| SEO-9 | Per-pillar OG cards for the 4 SEO pillars (multimodal AIO). | marketing pillars | 🟡 low | 📋 |
| — | **Verified clean:** metadataBase, dynamic sitemap, robots (AI-bot allow rules), canonicals on detail pages, correct noindex on auth/util, rich JSON-LD library. | — | ✓ | ✓ |

---

## 6. Infra / housekeeping

| ID | Finding | Status |
|---|---|---|
| INF-1 | `pnpm lint` — 2 unused-var warnings (`lib/spaces/ai-usage.test.ts:27`). | 🔧 |
| INF-2 | Supabase advisor: enable Auth leaked-password protection (owner dashboard config). | 📋 (owner) |
| INF-3 | Supabase advisors / migration drift / dependency currency — run the `maintenance` skill on a schedule. | 📋 (automate) |

---

## 7. Fix batches (this sweep)

Shipped as verified, merge-on-green PRs:

1. **Build list** (this doc + BUILD-SEQUENCE rows) — the organized to-do list.
2. **Security** — SEC-1…SEC-8 (guards, bounds, report-target binding, scope checks).
3. **Wiring & cleanup** — BUG-1 (event-warm-proof reachable) + BUG-2 (test) + BUG-3 + BUG-4 (dead-code removal) + INF-1.
4. **Performance** — PERF-1…PERF-7 (N+1 batching, Promise.all, React.cache, Suspense).
5. **SEO** — SEO-1, SEO-4…SEO-7.

Everything marked 📋 is triaged into the backlog (BUILD-SEQUENCE Idea Inbox) for tomorrow, with the riskier items (migrations, dormant money gates, LLM concurrency) deliberately not blind-merged to production.

---

*Owner: Daniel (Vision Steward). Generated 2026-06-29. The fix batches above land the 🔧 items; the 📋 items are the organized backlog.*
