# Naming Canon 2026 — Phase 1 change plan (committed before execution)

Canon: [docs/NAMING.md](../NAMING.md) · ADR-208. Inventories: INVENTORY-{CODE,DOCS,CONTENT}.md.
Branch-only; migrations authored, NOT applied to prod until merge approval.

## Wave 2 — migrations (authored by one agent, reviewed line-by-line, sequenced)
1. `pillars` — rename table `domains`→`pillars`, `topical_channels.domain_id`→`pillar_id`; fix "Channels = the 4 Domains" framing in comments; rename any domain RPC/index.
2. `tiers` — practice_tiers/journey_plan_items.default_tier/circles.default_intensity_tier/journey_plan_adoptions.tier_override values + CHECK constraints: spark→initiate, current→adept, deep→master (default Adept). Seeded rows UPDATEd.
3. `ranks` — `season_rank_enum`: RENAME VALUE runner→echo, operative→signal, agent→beacon (order preserved; lifetime_rank shares enum). Recreate `reset_season()`/recalc RPCs with new rank text + ZAP_TO_GEM_RATES comment. UPDATE seeded data: achievements criteria `{"rank":"agent"}`→beacon, names "Runner Unlocked" etc., season_challenges 'reach-conduit' unaffected, zap-action seed rows mentioning arc.
4. `circle_current` — table `circle_field_transactions`→`circle_current_transactions`, column `circles.current_season_field`→`circles.season_current`, trigger/function renames, RLS policy recreation, comments.
5. `roles_split` — add `profiles.web_role text check in ('none','admin','janitor') default 'none'`; data: janitor-rung holders→web_role janitor, admin-rung→web_role admin, each assigned community_role mentor (FLAGGED for human review in report); community_role enum: admin/janitor rungs become deprecated no-ops (kept for enum-order safety, like ADR-207 crew); rewrite the ~60 `>= 'rung'` RLS comparisons that meant staff to read web_role; `get_my_web_role()` helper. Crew rung re-activated: billing webhook auto-sets community_role='crew' on paid (and back to member on lapse? — business rule: set on pay, KEEP on lapse pending tuning — noted in ADR).
6. `vault_awards` — none needed (labels only); season_trophies untouched (0 rows; reset_season writes new names forward).

## Wave 3 — code (3 parallel agents, disjoint)
A) game/economy: season-ranks.ts (labels Echo/Signal/Beacon + header fix + remove Notion-authority line), ZAP_TO_GEM_RATES config in lib/economy (provisional note; all rollover refs read it), journey-arc.ts→quest-clock internals (file+exports; member-facing says season), tier constants/types initiate/adept/master, tier-meta.ts, app-shell "Bolts"→Zaps, digest.ts raw-enum bug fix (use label map), member-progress copy, achievements.ts criteria strings.
B) roles/capabilities: roles.ts two axes (+ webRole type), capabilities/load-capabilities (isStaff→web_role), auth.ts caller shape, requireAdmin/guard, sections.ts mins, nav tokens (plum apex; no color for web roles), billing webhook crew auto-set.
C) circle-current + chorus→co-op (lib/journey-chorus*→journey-coop, chorus-strip→coop-strip, page-config key), circle-field.ts→circle-current.ts + consts, quest phrasing sweep ("Seasonal Quest"→Quest), the-quest page-editor template + marketing page ranks, "points"→Zaps/Gems strings.

## Wave 4 — content agent: help articles (your-journey, build-a-journey, season-ranks, achievements, circle-field→Circle Current rewrite, events.md, season-challenges link, zaps-and-gems), SEO fallback strings. URL unchanged (incl. /help/groups/circle-field slug — title/content renamed only).

## Wave 5 — docs (me): GLOSSARY (re-canonize), JOURNEYS (tiers/Pillar Journeys/quest clock/§9.1 "Resonance"→Co-op), ECONOMY-AND-JOURNEYS, EVENTS-SYSTEM, THE-QUEST, CONTENT-ARCHITECTURE ("Channel = a Domain" violation), DATABASE, BUILD-LIST, CHANGELOG [Unreleased] only, MARKETING-BRIEF/ROADMAP.

## Wave 6 — verify: retired-term grep = 0 outside NAMING.md/ADR-208 + full tsc/lint/build/tests + types regen NOT possible until prod apply (use SQL-derived expectations; document).

## Resolved judgment calls
- "Domain Journeys"→"Pillar Journeys". JOURNEYS §9.1 co-op mechanic is Co-op (NOT Resonance — that's connection-layer).
- Hook-federation "points" (unbuilt PM spec, external product currency): KEEP in spec docs, noted.
- demo-notice "⚡" emoji: keep glyph; only "Bolts" labels rename.
- `--signal` brand token: KEEP (not a game term; rank colors stay on rankKey palette).
- CHANGELOG: [Unreleased] renamed; released history stays as written.
- Recruiter-ladder reuses "Luminary" (ADR-134): **OPEN QUESTION → user**.
- Crew on payment-lapse behavior: set-on-pay, keep-on-lapse provisional → ADR note.
