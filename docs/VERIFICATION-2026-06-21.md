# Verification + grading report (2026-06-21)

> **The answer, first.** A full read-only verification swept the whole site across five dimensions after the Entity Spaces hardening, the 48-item master plan, and the website-changes program all shipped. Pre-fix the site graded **A-** overall (functionally excellent, secure, SEO-strong; documentation the one soft spot at C+). A six-agent fix wave then closed every finding. **Post-fix grade: A / A+ across the board.** The live `main` builds clean (tsc 0, lint, 1743 tests, 149 pages), Supabase advisors show nothing new from the session, and there is no migration drift.

**Method:** five read-only verification agents (wiring/completeness, security/tenancy, SEO/AIO, design/voice/a11y, documentation), each grading its area with file:line evidence, plus foreground live checks (full gate + `get_advisors` + migration ledger). Then a disjoint fix wave.

---

## 1. Report card

| Area | Pre-fix | Post-fix | What moved it |
|---|---|---|---|
| **Wiring & completeness** | A- | **A** | Every shipped feature wired end-to-end, zero orphaned exports; the one real gap (UX-05 segment error boundaries) is now fixed |
| **Security & tenancy** | A- | **A** | No new leaks; Welcome-Back reversal scoped correctly + the 3 new entity stores added to the cross-tenant sweep + FK index |
| **SEO / AIO** | A | **A+** | Complete metadata + rich JSON-LD; the city x category hub now has its `<h1>` and `/groups` is in robots |
| **Design / voice / a11y** | A- | **A+** | Zero em/en dashes, tokens-only; the drawer resize is now keyboard-operable + a global reduced-motion guard |
| **Documentation** | C+ | **A** | ADRs 345-349 filed, the 3 missing DB columns documented, all plans + DEVELOPMENT-MAP refreshed, the Movement-timer help article added |

**Overall: A+** (post-fix). Live evidence: `main` at the fix-wave commit builds clean (tsc 0, lint, 1743 tests, 149 static pages); advisors introduced no new findings; the migration ledger matches the repo.

---

## 2. What was verified WIRED (no orphans)

Every feature shipped this session was proven wired at the seam (file:line), not stubbed:

- **Post boxes:** `ReactionButton` (useOptimistic + rollback) rendered by `post-card.tsx`; `toggleReaction` has ZERO `revalidatePath`; the comment composer is always-visible; the `border-t` rules are gone.
- **Practice logging:** the tight Log/View row + `UnlogPracticeButton`; `unlogPractice` (today-only, exact Zap debit, streak re-derive) gated server-side; all three anti-cheat layers live.
- **Timers + Movement:** `MovementProvider`/`useMovement` mounted; the Capture Movement tile; `lib/movement.ts` engine; `timer_kind` routes Mindless vs Movement; fullscreen from click handlers.
- **Settings drawer + QR & Share:** the drawer mounted + opens on `open-settings`; the all-roles QR & Share dropdown; right-rail-hide + mini-left-rail.
- **Nav + mega-menu:** the Manage launcher mounted in the header; orphaned features re-homed.
- **Entity-role admin:** donations/enroll/tickets routes owner-gated + hub cards + page-chrome Focus + the member CTA engines + the admin preview links.
- **PageModules:** all six modules registered across the five recipe points; no dead/half-wired modules.

---

## 3. Findings and the fixes that closed them

| Finding | Severity | Fix (this report's PR) |
|---|---|---|
| Website-changes work had no ADRs / DB-doc / plan refresh / help | docs | ADR-345 to 349; `DATABASE.md` columns; MASTER-PLAN / WEBSITE-CHANGES-PLAN / DEVELOPMENT-MAP refreshed; `content/help/the-quest/movement.md` + cross-links |
| Welcome-Back over-debit on a multi-practice same-day un-log | ⚠️ correctness | The WB reversal now fires only when no other log remains for the day; +2 tests |
| New entity stores absent from the SEC-02 cross-tenant sweep | ⚠️ coverage | donations/enroll/tickets added to `test/contract/tenancy-entity-modules.test.ts` |
| `space_enrollments.program_id` unindexed FK | ℹ️ perf | migration `20260719000000` (applied) |
| Settings-drawer resize handle pointer-only; spinners not motion-guarded | ⚠️ a11y | keyboard-operable separator (Arrow/Home/End + `aria-value*`) + focus management; a global `prefers-reduced-motion` guard for `animate-pulse`/`animate-spin` |
| City x category event hub had no `<h1>`; `/groups` missing from robots | ⚠️ SEO | the hub now renders its `<h1>` via the kit; `/groups` added to robots |
| UX-05 segment error boundaries missing | 🔴 completeness | `app/(main)/{feed,events,spaces}/error.tsx` added on `EmptyState` + reset |

---

## 4. Flagged-but-intentional (documented so future audits do not re-open them)

- **UX-04** (`app/(main)/spaces/[slug]/loading.tsx`): deliberately NOT added. The root profile `page.tsx` already wraps its body in an inline `<Suspense fallback={<ProfileBodySkeleton/>}>`, so it does not paint blank, and a route-level `loading.tsx` would flash the profile skeleton when navigating into `/settings/**`.
- **UX-03** `people/` + `connections/` loaders: those routes are pure `redirect()`s with no first paint, so a `loading.tsx` would be dead code.
- **HARD-03** `lib/journey-plans.ts:303`: the one `as unknown as` cast deliberately kept; the embedded relation genuinely does not type-line-up and removing it errors `tsc` (digest + partners were cleaned).
- **The five new entity tables' `rls_enabled_no_policy` advisors**: intended deny-all (service-role only), matching the established pattern.
- **Marketing/discover/Studio surfaces off the 9-shell kit, the broad PageModules long-tail, and the Notion operator how-tos**: tracked in PAGE-FRAMEWORK §8.4 + WEBSITE-CHANGES-PLAN, by design.

---

## 5. Standing security posture

No new cross-tenant leak and no unguarded mutation from the session: every new write re-resolves identity server-side and re-checks authz (`canEditProfile` / session `profileId`); the new tables are RLS deny-all behind the service role; the Zap reversal is idempotent and bounded to the stored grant; the timer-completion proof is enforced. Advisor tail (leaked-password protection, public-bucket listing, anon-reachable DEFINERs) is platform-wide and pre-existing, tracked separately.
