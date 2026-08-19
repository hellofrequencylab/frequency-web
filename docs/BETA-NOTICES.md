# Beta notices — the launch checklist

> **The answer, first.** Every place the site says "free during the Beta / founder pricing / no card"
> is catalogued here with its **driver** (what makes it change) and its **launch action**. On launch
> day, work top to bottom: flip the switches, then edit the hardcoded copy. Owner: whoever runs the GA
> cutover (target **September 1**).

## 1. The rule

Beta-tied **notice copy** should read from **one module** so a single edit updates it everywhere it is
adopted: [`lib/core/beta-notices.ts`](../lib/core/beta-notices.ts).

- `betaOpen` / `betaLeadLine()` — the "Beta is open through {date}, this is free" lead, or `null` after launch.
- `crewUpgradeSuffix()` — "Crew is free during the Beta, one tap, no card." → "Crew is a paid membership."
- `crewCreateUpsell(what)` — the full "Upgrade to Crew to create {what}. …" line.
- `contentSafetyLine(kind)` — the "nothing you build is ever lost" promise (beta-independent).
- `BETA_ENDS_LABEL` — the date string (`September 1`); change here and every notice that reads it follows.

All of the above are gated by **`BETA_OPEN_ACCESS`** ([`lib/core/beta.ts`](../lib/core/beta.ts)), the master
entitlement switch (while `true`, every signed-in member is granted the Crew tier — `lib/auth.ts`).

**Important:** flipping `BETA_OPEN_ACCESS` only updates copy that reads this module. Most site copy does
**not** yet, and some is gated on *different* switches. The table below is the source of truth for what
each notice actually depends on.

## 2. The switches to flip at launch

| Switch | Where | Effect |
|---|---|---|
| `BETA_OPEN_ACCESS` | `lib/core/beta.ts:16` | Master grant + all copy routed through `beta-notices.ts`. Flip to `false`. |
| `BETA_GRANTED_TIER` | `lib/core/beta.ts` | The tier granted during beta (`crew`). Leave; it stops applying once the flag is off. |
| `billingLive()` | `lib/pricing/settings` (DB `platform_settings`) | Gates the `/upgrade` + `/settings/billing` beta banners and founder-reservation actions. Turn on when billing goes live. |
| `betaEndsAt()` | `lib/platform-flags.ts` (DB) | The countdown clock (`beta-countdown-banner`). Auto-hides after the date. |
| `BETA_INDUCTION_ACTIVE`, `BETA_MEMBERS_GET_CREW` | `lib/onboarding/beta-script.ts` | The beta induction flow. Flip; the module is retired at GA. |
| `ALERT_KEY` | `components/layout/site-alert-bar.tsx:17` | Bump after editing the alert copy so it re-shows. |

## 3. The inventory (edit at launch)

Legend — Driver: 🟢 `BETA_OPEN_ACCESS` (auto-swaps via `beta-notices.ts`) · 🟡 other flag
(`billingLive`/`betaEndsAt`/induction — auto-hides when that flips) · 🔴 hardcoded (manual edit).

### Create / authoring surfaces
| File | Copy | Driver | Launch action |
|---|---|---|---|
| `components/pricing/authoring-access-note.tsx` | Beta lead + rule + safety, on every create surface | 🟢 | Auto-swaps. Verify wording. |
| `lib/core/load-capabilities.ts:96` | `assertCanCreate` throw | 🟢 (`crewCreateUpsell`) | Auto. |
| `app/(main)/practices/create-actions.ts` · `practices/actions.ts` | "Upgrade to Crew to create a practice…" | 🟢 (`crewCreateUpsell`) | Auto. |
| `app/(main)/journeys/create-actions.ts` | "Upgrade to Crew to build a Journey…" | 🟢 (`crewCreateUpsell`) | Auto. |

### Upgrade / upsell components
| File | Copy | Driver | Launch action |
|---|---|---|---|
| `components/crew/upgrade-lightbox.tsx:75,81` | "Crew is free during the beta…", CTA "Upgrade to Crew, free" | 🔴 | Route line 75 through `crewUpgradeSuffix()`; drop "free" in the CTA. |
| `components/crew/crew-preview-banner.tsx` · `components/layout/upgrade-crew.tsx` | Generic upgrade blurbs | 🔴 (no beta claim) | Safe as-is. |
| `components/pricing/feature-tier-upsell.tsx` · `feature-meter-upsell.tsx` | Tier/meter notes | 🟡 `billingLive()` | Auto when billing live. |

### Marketing / onboarding (all 🔴 unless noted)
| File | Copy | Launch action |
|---|---|---|
| `app/(main)/upgrade/page.tsx:79` | "…free during beta." (always shown) | Manual edit. **High risk (unconditional).** |
| `app/(main)/upgrade/page.tsx:82-206` · `app/(main)/settings/billing/page.tsx:85` | Free-beta banners | 🟡 `billingLive()` auto-hides. |
| `components/layout/site-alert-bar.tsx:63` | "Frequency will be in Beta until September 1st…" | Edit copy + bump `ALERT_KEY`. |
| `components/layout/beta-countdown-banner.tsx` | "We're in Beta. The Founding Business rate ends…" | 🟡 `betaEndsAt()` auto-hides. Reframed 2026-08-06: what ends is the **rate**, not free access. The closing clause ("it stays your rate") is load-bearing, not decoration — see the file's header. |
| `app/page.tsx:125,137,249,588` | Home hero + FAQ "free for the whole beta / no card / $10/mo" | Manual edit (4 strings). **High risk.** |
| `app/(marketing)/beta/*` · `app/(marketing)/founders/*` · `components/marketing/beta-form.tsx` · `components/discover/inline-beta-capture.tsx` | Waitlist + founder-reservation funnels | Retire at GA. |
| `lib/marketing/comparisons.ts` (×6) · `app/(marketing)/what-is-frequency`, `/vs`, `/vs/[slug]`, `/spaces` · `app/discover/cities/*` · `app/llms.txt/route.ts:147` | "Free to join during the beta." / "Free during the beta." | Manual edit. Candidate to centralize (see §4). |
| `app/onboarding/beta/*` | Induction flow | 🟡 induction flags; module retired at GA. |

### Emails — ✅ nothing left to edit
The beta email arc is **deleted** (2026-08-19, with the Beta Command Center): `lib/beta/launch-emails.ts`,
`lib/beta/email-templates.ts` and `lib/beta/email.ts` are gone, and with them the Founding Member /
Founding Business / "Founder pricing closes September 1" / waitlist drafts and their seeder. There is no
authored beta email left to reword at GA. Email Studio itself is untouched and still composes ordinary
campaigns; what survives underneath it is the approval spine (`lib/outbound/*`), which is not beta-specific.
The `email-copy.ts` Vera prompt this row used to flag ("beta launch email") no longer exists either: a
repo-wide grep for the phrase returns nothing.

### Demo / help
| File | Copy | Launch action |
|---|---|---|
| `components/ui/demo-badge.tsx` · `components/sidebar/demo-notice.tsx` | "…looks alive during the Beta" | Remove demo-seeding notice at GA. |
| `content/help/**` (events, getting-started/practices, leading/how-to-start-a-circle) | "Crew is free during the beta…" | Manual markdown edits. |

## 4. Recommended consolidation (reduce launch-day manual edits)

These verbatim phrases recur and should route through `beta-notices.ts` when next touched:

1. **"Crew is free during the beta, one tap, no card."** — done for the four create gates + `assertCanCreate`; still hardcoded in `upgrade-lightbox.tsx:75` and 3 help-center markdown files.
2. **"Free to join during the beta."** (×11 marketing) — add a `marketingFreeLine()` to `beta-notices.ts` and adopt.
3. **"Free during the beta."** (hero eyebrow, ×4) — same.
4. **Home `app/page.tsx`** (4 strings) and **`/upgrade` description** (unconditional) — the two highest-risk hardcoded spots; wire to the module or a `<BetaOnly>` wrapper.

## 5. Cross-links
- The switch + grant: [`lib/core/beta.ts`](../lib/core/beta.ts) · [`lib/auth.ts`](../lib/auth.ts).
- The copy rule: [`lib/core/beta-notices.ts`](../lib/core/beta-notices.ts).
- Pricing/plan gates: [`lib/pricing/gates.ts`](../lib/pricing/gates.ts), [`docs/PRICING-LADDER-PLAN.md`](PRICING-LADDER-PLAN.md).

---

*Keep this current: when you add a beta-tied notice, route it through `lib/core/beta-notices.ts` and add
its row here. When you launch, work §2 then §3.*
