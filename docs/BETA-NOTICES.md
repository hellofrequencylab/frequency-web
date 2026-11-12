# Beta notices — historical inventory

> **Current beta end: January 31, 2027** (owner ruling 2026-11-11). This is a historical inventory
> of beta notices and their code drivers, not a launch-day runbook. Check the current handoff and
> `docs/BUILD-BACKLOG.json` before acting on any item here.

## 1. The rule

Beta-tied **notice copy** should read from **one module** so a single edit updates it everywhere it is
adopted: [`lib/core/beta-notices.ts`](../lib/core/beta-notices.ts).

- `betaOpen` / `betaLeadLine()` — the "Beta is open through {date}, this is free" lead, or `null` after launch.
- `crewUpgradeSuffix()` — "Crew is free during the Beta, one tap, no card." → "Crew is a paid membership."
- `crewCreateUpsell(what)` — the full "Upgrade to Crew to create {what}. …" line.
- `contentSafetyLine(kind)` — the "nothing you build is ever lost" promise (beta-independent).
- `BETA_ENDS_LABEL` — the date string (`January 31`); change here and every notice that reads it follows.

All of the above are gated by **`BETA_OPEN_ACCESS`** ([`lib/core/beta.ts`](../lib/core/beta.ts)), the master
entitlement switch (while `true`, every signed-in member is granted the Crew tier — `lib/auth.ts`).

**Important:** flipping `BETA_OPEN_ACCESS` only updates copy that reads this module. Most site copy does
**not** yet, and some is gated on *different* switches. The table below is the source of truth for what
each notice actually depends on.

## 2. Historical switch inventory

This table records earlier assumptions only. It does not authorize a switch change; follow the active
handoff and the owner approval gates before any operational change.

| Switch | Where | Effect |
|---|---|---|
| `BETA_OPEN_ACCESS` | `lib/core/beta.ts:16` | Master grant + all copy routed through `beta-notices.ts`. Flip to `false`. |
| `BETA_GRANTED_TIER` | `lib/core/beta.ts` | The tier granted during beta (`crew`). Leave; it stops applying once the flag is off. |
| `billingLive()` | `lib/pricing/settings` (DB `platform_settings`) | Gates the `/upgrade` + `/settings/billing` beta banners and founder-reservation actions. Turn on when billing goes live. |
| `betaEndsAt()` | `lib/platform-flags.ts` (DB) | The countdown clock (`beta-countdown-banner`). Auto-hides after the date. |
| `FUNNEL_INDUCTION_ACTIVE`, `BETA_MEMBERS_GET_CREW` | `lib/onboarding/funnel-script.ts` | The Funnels induction (ADR-1090). `BETA_MEMBERS_GET_CREW` flips at GA; the Funnels machinery itself stays. |
| ~~`ALERT_KEY`~~ | ~~`components/layout/site-alert-bar.tsx`~~ | ✅ **Retired 2026-08-26** (ADR-1166). The strip is operator-written now and its dismissal key is derived from the message, so there is no constant to bump. |

## 3. Historical inventory

> **Historical inventory.** This section records copy locations and prior switch assumptions. It is not
> evidence that each string is current or that each switch should be changed. The active beta and launch
> work is sequenced in `docs/BUILD-BACKLOG.json`; phase intake dates do not change the January 31, 2027 beta end.

Legend — Driver: 🟢 `BETA_OPEN_ACCESS` (auto-swaps via `beta-notices.ts`) · 🟡 other flag
(`billingLive`/`betaEndsAt`/induction — auto-hides when that flips) · 🔴 hardcoded (manual edit).

### Create / authoring surfaces
| File | Copy | Driver | Recorded note |
|---|---|---|---|
| `components/pricing/authoring-access-note.tsx` | Beta lead + rule + safety, on every create surface | 🟢 | Auto-swaps. Verify wording. |
| `lib/core/load-capabilities.ts:96` | `assertCanCreate` throw | 🟢 (`crewCreateUpsell`) | Auto. |
| `app/(main)/practices/create-actions.ts` · `practices/actions.ts` | "Upgrade to Crew to create a practice…" | 🟢 (`crewCreateUpsell`) | Auto. |
| `app/(main)/journeys/create-actions.ts` | "Upgrade to Crew to build a Journey…" | 🟢 (`crewCreateUpsell`) | Auto. |

### Upgrade / upsell components
| File | Copy | Driver | Launch action |
|---|---|---|---|
| `components/crew/upgrade-lightbox.tsx:75,81` | "Crew is free during the beta…", CTA "Upgrade to Crew, free" | 🔴 | Route line 75 through `crewUpgradeSuffix()`; drop "free" in the CTA. |
| ~~`components/crew/crew-preview-banner.tsx`~~ · `components/frequency/members/shell/nav.ts` (current Join Crew door; DAWN tab retired HYG213) | Generic upgrade blurbs | 🔴 (no beta claim) | Safe as-is. The preview banner was DELETED on 2026-09-09 ([ADR-1295](DECISIONS.md)): it told a free member to upgrade to "earn, spend, and climb", all three of which every member now does. |
| `components/pricing/feature-tier-upsell.tsx` · `feature-meter-upsell.tsx` | Tier/meter notes | 🟡 `billingLive()` | Auto when billing live. |

### Marketing / onboarding (all 🔴 unless noted)
| File | Copy | Launch action |
|---|---|---|
| `app/(main)/upgrade/page.tsx:79` | "…free during beta." (always shown) | Manual edit. **High risk (unconditional).** |
| `app/(main)/upgrade/page.tsx:82-206` · `app/(main)/settings/billing/page.tsx:85` | Free-beta banners | 🟡 `billingLive()` auto-hides. |
| ~~`components/layout/site-alert-bar.tsx`~~ | ~~retired beta end notice~~ | ✅ **Done 2026-08-26** (ADR-1166). The file is gone. The strip is now `components/layout/announcement-bar.tsx`, it carries no sentence of its own, and it mounts **signed-in only** — it had been rendering on the marketing tree, `/discover`, the help centre and the public Space twins. |
| `components/layout/beta-countdown-banner.tsx` | older beta and price wording | 🟡 `betaEndsAt()` auto-hides. Reframed 2026-08-06: what ends is the **rate**, not free access. The closing clause ("it stays your rate") is load-bearing, not decoration — see the file's header. |
| `app/page.tsx:125,137,249,588` | Home hero + FAQ "free for the whole beta / no card / $10/mo" | Manual edit (4 strings). **High risk.** |
| `app/(marketing)/beta/*` · `app/(marketing)/founders/*` · `components/marketing/beta-form.tsx` · `components/discover/inline-beta-capture.tsx` | Waitlist + founder-reservation funnels | Retire at GA. |
| `lib/marketing/comparisons.ts` (×6) · `app/(marketing)/what-is-frequency`, `/vs`, `/vs/[slug]`, `/spaces` · `app/discover/cities/*` · `app/llms.txt/route.ts:147` | "Free to join during the beta." / "Free during the beta." | Manual edit. Candidate to centralize (see §4). |
| `app/join/*` | Funnels induction flow | 🟡 `BETA_MEMBERS_GET_CREW` flips at GA; the Funnels machinery stays (ADR-1090). |

### Beta email code in this repository
The old code-based beta email arc was deleted on 2026-08-19 with the Beta Command Center. The former
files `lib/beta/launch-emails.ts`, `lib/beta/email-templates.ts` and `lib/beta/email.ts` are gone,
along with that code's old drafts and seeder. This repository inventory does not describe drafts staged
in Email Studio. The approval spine (`lib/outbound/*`) is not beta-specific.
The `email-copy.ts` Vera prompt this row used to flag ("beta launch email") no longer exists either: a
repo-wide grep for the phrase returns nothing.

### Demo / help
| File | Copy | Launch action |
|---|---|---|
| `components/ui/demo-badge.tsx` · `components/sidebar/demo-notice.tsx` | "…looks alive during the Beta" | Remove demo-seeding notice at GA. |
| `content/help/**` (events, getting-started/practices, leading/how-to-start-a-circle) | "Crew is free during the beta…" | Manual markdown edits. |

## 4. Historical consolidation recommendations

The recommendations formerly listed here are archived. Use the active build handoff and backlog to
decide whether any beta copy work remains and who owns it.

## 5. Cross-links
- The switch + grant: [`lib/core/beta.ts`](../lib/core/beta.ts) · [`lib/auth.ts`](../lib/auth.ts).
- The copy rule: [`lib/core/beta-notices.ts`](../lib/core/beta-notices.ts).
- Pricing/plan gates: [`lib/pricing/gates.ts`](../lib/pricing/gates.ts), [`docs/PRICING-LADDER-PLAN.md`](PRICING-LADDER-PLAN.md).

---

*Historical reference only. Do not use this inventory as a current launch checklist. Follow the active
build handoff and backlog for current beta notices and approval gates.*
