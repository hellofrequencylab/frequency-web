# Remaining work (deferred build list)

**What it is:** the consolidated, honestly-marked list of work deliberately deferred after the
Pricing (ADR-362/363/364) and My Contacts CRM (ADR-361) builds shipped, plus the still-designed-only
Network rework (ADR-154). Each item already lives in a source doc; this page is the one place to read
the whole tail at a glance. The source docs stay the spec; this links back, never duplicates.

Status legend: ✅ shipped · ⏳ in progress · 📋 designed, not built · 🔴 after PMF / blocked.

## Pricing (📋 deferred gates on top of ADR-362/363/364)

Source of truth: [PRICING.md](PRICING.md) "Status & deferred". The layer ships OFF; these are the
gates and polish not yet wired so as not to change live behavior while `billing_live` is OFF.

| # | Item | One line |
|---|---|---|
| 1 | Leaderboard "join to compete" gate | The compete gate + its UI, not yet routed through `featureAllowed`. |
| 2 | `resolveGamificationAccess` live consumer | A real consumer reading the resolved gamification access tier. |
| 3 | `vera_unlimited` gate | Gate Vera's unlimited usage on the entitlement (deferred to avoid changing live Vera). |
| 4 | `space_*` feature-gates via `featureAllowed` | The `space_*` plan features still resolve via `spaceHasEntitlement`; move them onto `featureAllowed`. |
| 5 | `gamification_full` standalone gate | A standalone gate for the full gamification entitlement. |
| 6 | Household / Circle bundle (P2) | The multi-seat bundle pricing path. |
| 7 | Dunning / proration / past-due UX | The member-facing recovery flows for failed/changed payments. |
| 8 | Conversion-mechanics polish | The season-reset upgrade prompt + other conversion nudges. |
| 9 | `pricing_*` type regen | Regenerate the generated types once the pricing columns are typed. |

## CRM (📋 follow-ups on top of ADR-361, P1-P3 shipped)

Source of truth: [CRM-STRATEGY.md](CRM-STRATEGY.md) + [NETWORK-CRM.md](NETWORK-CRM.md). The personal
CRM and its graduation into the paid Spaces CRM shipped; these extend it.

| # | Item | One line |
|---|---|---|
| 10 | Reciprocal QR handshake | A two-way capture so both members keep each other on a scan. |
| 11 | Reconcile duplicate contact surfaces | `/network/contacts` vs the friends `ContactsList` are two surfaces over the same data. |
| 12 | Per-segment custom field templates | Owner-defined fields scoped to a CRM segment. |
| 13 | Custom objects | Owner-defined record types beyond contacts/deals. |
| 14 | Reach-out home pulse | Surface the "reach out today" list as a home-screen pulse. |
| 15 | Member copy pass | Run all CRM copy through [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md). |
| 16 | Instrument upgrade-trigger events | Track the events that signal a member is ready to graduate to the paid CRM. |

## Network rework (📋 designed, not built — ADR-154)

Source of truth: [ADR-154](DECISIONS.md) + [NETWORK-CRM.md](NETWORK-CRM.md) "The Network rework" +
[ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §5. Reworks the steward tool into a member-facing
Network product; the data model is unchanged, this is IA + access-tier + capture surfaces.

| # | Item | One line |
|---|---|---|
| 17 | Promotion `network_contacts` → `contacts` | Promote a private contact into the public/network table (gated; leak risk concentrates here). |
| 18 | `shared` (team) visibility | The team-shared visibility tier, modelled but not surfaced. |
| 19 | More capture sources | Email / calendar import on top of the open `source` field. |
| 20 | Full Network rework | The member-facing Network IA + event-invite capture loop (`event_guests`, triple-write, etc.). |
