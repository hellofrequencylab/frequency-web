# Block inventory and consolidation map (E2 input)

> **The answer, first.** **304 block rows across five systems**, not the ~138 across three the plan
> first estimated. They map to **~49** with **no capability dropped** — every collapse is a
> `variant`, a `binding.source`, or a `density`. Three fields carry almost all of it:
> `binding.source` collapses **109 layout modules into 4 blocks**.
>
> ⚠️ **~49 is a range, not a commitment** ([ADR-977](DECISIONS.md) D-11). The count moved from 138 to
> 304 on measurement; E2 gets its own planning pass once the usage index shows what is *placed*.
>
> Parent: [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md) §2.1 · Decisions:
> [ADR-974](DECISIONS.md) · [ADR-977](DECISIONS.md).
> **Counts verified against code; retirement risk verified against the live database, 2026-08-10.**

---

## A. Exact counts

| System | Root type | Types | Live importers |
|---|---|---:|---:|
| Entity blocks | `ENTITY_BLOCKS` — `lib/entity-blocks/registry.ts` | **36** | 12 |
| Puck-shaped | `config.components` — `lib/page-editor/config.tsx` | **88** | 15 |
| Layout modules | `LAYOUT_MODULES` — `lib/widgets/modules.ts` | **157** | 5 |
| 🔴 Space profile | `PROFILE_BLOCKS` — `lib/spaces/profile-blocks.ts` | **13** | 4 |
| 🔴 Spotlight | `BlockType` union — `lib/spotlight/blocks/schema.ts:28` | **10** | 11 |
| | | **304** | |

The two 🔴 rows are the ones three plan documents missed. `ENTITY_BLOCKS`' header says it "unifies
the two prior systems" — **that describes an intent, not the tree. Neither was retired.**

### Secondary counts

| Set | Count | Note |
|---|---:|---|
| Entity blocks declaring `email` | 14 | ⇄ `EMAIL_PALETTE_BLOCK_IDS` (14), locked 1:1 ✅ |
| `CORE_PROFILE_BLOCK_IDS` | 27 | **9 entity blocks are registry-legal but offered on no web palette** |
| Puck types reachable from a `config.categories` row | 85 | **3 unreachable**: `SpaceArrangement`, `DisplayHeading`, `Prose` |
| Layout modules in a `ROUTE_MODULE_IDS` set | 146 | **11 deliberately parked** |
| Layout modules bound to a component | 157 | complete ✅ |

---

## B. The three worst duplications

1. **The Spotlight/Space/Design triple.** `heading` exists as an entity id, as `Heading` (kit), as
   `SpotlightHeading` (linktree), as `SpaceSectionTitle` (profile) and as `DisplayHeading` (design).
   ⚠️ **Ten of these pairings are formalised in `lib/spotlight/puck/convert.ts:31` as
   `SPOTLIGHT_PUCK_TYPES`** — an explicit entity-id ⇄ Puck-type bijection. This is documented
   duplication, not drift, which is why it survived three plan docs.
2. **A three-hop render for authored Space content.**
   `components/widgets/space-profile/authored-content.tsx:44` maps entity content ids →
   `SpaceAuthoredGroup` → `BlockRender(config)` → the Puck `Spotlight*` components. **The entity
   registry renders *through* the Puck registry** for `heading`, `text`, `image`, `gallery`, `quote`,
   `embed`, `divider`.
3. **Clusters 16 and 28 are the volume.** 25 layout modules are a stat row with a different data
   source; 45 are a collection with a different data source. **These are not 70 blocks — they are 2
   blocks and 70 bindings.** That single observation is where most of the 304 → ~49 reduction comes
   from.

---

## C. The consolidation target

Two tiers, one registry. Surface keys: **PI** `profile-inapp` · **SP** `spotlight-public` ·
**ZP** `space-profile` · **ZS** `space-site` · **EM** `email`.

### Tier A — 34 page blocks

| `type` | Collapses | `kinds[]` | `reads` | Surfaces |
|---|---|---|---|---|
| `frq/heading` | E `heading`,`displayHeading` · P `Heading`,`SpotlightHeading`,`SpaceSectionTitle`,`DisplayHeading` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/text` | E `text`,`prose` · P `Text`,`SpotlightText`,`Prose`,`Statement`,`Manifesto` · L `circle-text` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/divider` | E `divider` · P `Divider`,`SpotlightDivider`,`Spacer` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/section` | P `Container`,`Columns`,`SpaceLayout`,`SpaceArrangement` | space | authored | ZP ZS |
| `frq/button` | E `button` · P `Buttons` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/image` | E `image` · P `Image`,`SpotlightImage`,`PhotoBeat` · ❓`ImageBand` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/gallery` | E `gallery` · P `Gallery`,`SpotlightGallery`,`PhotoTrio`,`Marquee` · L `event-gallery`,`event-recap` · ❓`FeatureGallery` | member, space | authored | PI SP ZP ZS |
| `frq/embed` | E `embed` · P `SpotlightEmbed` | member, space | authored | PI SP ZP ZS |
| `frq/recording` | E `recording` | member, space | live | PI SP ZP ZS |
| `frq/hero` | E `photoHero` · P `Hero`,`PhotoHero`,`Cover` · ❓`PageHero` | space, email | authored | ZP ZS EM |
| `frq/editorial` | E `editorial` · P `EditorialSection` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/media-text` | E `zigzag` · P `Zigzag`,`MediaText`,`IllustratedFeature` · ❓`ZigZag` | space | authored | ZP ZS |
| `frq/features` | E `features`,`cardGrid` · P `FeatureGrid`,`CardGrid`,`ValueBand`,`Showcase`,`PillarNav`,`PhotoCardRow`,`StatRow` · L ×2 | space, email | authored | ZP ZS EM |
| `frq/callout` | E `callout`,`accentBeat` · P `CallToAction`,`SpaceCallout`,`SpaceCTA`,`SpaceAction`,`AccentBeat`,`BackTheBuild` · L `entity-cta` · ❓`BetaCTA` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/quote` | E `quote` · P `Quote`,`SpotlightQuote` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/steps` | P `BuildTimeline`,`SeasonTimeline`,`DawnHowToSteps`,`Checklist`,`StoryBeats`,`QuestLoop`,`RolesPath`,`PlanBand`,`CircleFirstNight` · L ×2 | space, email | authored | ZP ZS EM |
| `frq/form` | P `LeadFunnel`,`RolePicker` — **also E7's form block** | space | authored | ZP ZS |
| `frq/identity-header` | P `SpaceIdentityHeader` | space | live | ZP ZS |
| `frq/about` | E `about`,`story` · P `SpaceAbout` · L ×4 | member, space | live | PI SP ZP ZS |
| `frq/stats` | E `stats` · P `SpaceStats`,`SpaceHighlights`,`SpotlightStats`,`LiveStats` · L `entity-stats` | member, space | live | PI SP ZP ZS |
| `frq/offerings` † | E `offerings`,`productCard` · P `SpaceOfferings`,`Tiers` · L ×3 | member, space, email | live + `resolveAt:'send'` | PI SP ZP ZS EM |
| `frq/booking` | E `booking` · P `SpaceBooking` | member, space | live | PI SP ZP ZS |
| `frq/events` | E `events` · P `SpaceEvents`,`LiveEvents` · L ×3 | member, space | live | PI SP ZP ZS |
| `frq/programs` | E `practices`,`journeys`,`circles` · P `SpacePractices`,`SpaceCommunity`,`Circles*` · L ×2 | member, space | live | PI SP ZP ZS |
| `frq/people` | E `team`,`topfriends` · P `SpaceTeam`,`TopFriends` · L `entity-team` | member, space | live | PI SP ZP ZS |
| `frq/reviews` | E `reviews` · P `SpaceReviews` · L `event-warm-proof` | member, space | live | PI SP ZP ZS |
| `frq/faq` | E `faq` · P `SpaceFAQ`,`Accordion` · L `event-good-to-know` | space | live | ZP ZS |
| `frq/posts` | E `updates` · P `SpaceUpdates`,`LivePosts` | member, space | live | PI SP ZP ZS |
| `frq/contact` | E `contact` · P `SpaceContact` | member, space | live | PI SP ZP ZS |
| `frq/social` | E `business` · P `SpaceBusiness` | member, space | live | PI SP ZP ZS |
| `frq/links` | E `links` · P `LinkTree`,`SpaceQuickLinks` | member, space, email | authored | PI SP ZP ZS EM |
| `frq/map` | P `CirclesMap` · L `circle-map`,`event-location`,`event-venue-map` | space | live | ZP ZS |
| `frq/filter-bar` | P `CirclesToolbar`,`CirclesChannelNav` | space | live | ZS |
| `frq/getting-started` | L `entity-getting-started` | space | live | ZP |

† **`frq/offerings` is the one sanctioned live-in-email block**, and it is legal only through
`resolveAt: 'send'` — see [`EDITOR-ARCHITECTURE`](EDITOR-ARCHITECTURE.md) §3 rule 3 and
[ADR-977](DECISIONS.md).

### Tier B — 15 operator-widget rows

Needs a sixth surface `app-page`, carrying `binding.source`, the `/seg/*` scope cascade, and the
`SlotConfig.roles` `CommunityRole` floor. ⚠️ **`page_settings.layout` is the only system with those
last two. Folding it in without them is a regression, not a refactor** (ADR-270/271/272).

| `type` | Collapses |
|---|---:|
| `frq.app/collection` | 45 modules |
| `frq.app/metric-row` | 25 |
| `frq.app/link-panel` | 23 |
| `frq.app/queue` | 16 |
| `frq.app/action-card` | 6 |
| `frq.app/feed` | 5 |
| 9 × `frq.console/*` | 9, genuinely bespoke editors, 1:1 |

### Result

| | Today | Target |
|---|---:|---:|
| Registry rows | **304** | **~49** |
| … page blocks (entity 36 + Puck 88) | 124 | 34 |
| … operator widgets (`LAYOUT_MODULES`) | 157 | 15 (28 absorbed by Tier A) |
| … Spotlight union (10) + `PROFILE_BLOCKS` (13) | 23 | **absorbed by Tier A** — every one is a duplicate of an entity/Puck row already collapsed above (`heading`, `text`, `links`, `image`, `gallery`, `quote`, `stats`, `topfriends`, `embed`, `divider`), which is *why* they are a duplication rather than a system worth its own target |
| Block **systems** | **5** | **1** |

Every one of the 304 maps to exactly one target, with no unmapped remainder.

---

## D. Retirement risk — measured against the live database

### 🔴 P0 — five stored types resolve to nothing ([ADR-977](DECISIONS.md) D-9)

| Slug | Status | Orphan types |
|---|---|---|
| `about` | draft | `BetaCTA`, `ImageBand`, `PageHero`, `ZigZag` |
| `the-lab` | draft | `BetaCTA`, `FeatureGallery`, `ImageBand`, `PageHero`, `ZigZag` |
| ~~`how-it-works`~~ | draft | ⚠️ **Not at risk** — it is not in `EDITABLE_PAGES` (a retired 308 redirect), so `/edit/how-it-works` redirects to `/pages` and the editor can never open it. An earlier draft counted it and overstated the blast radius by a third |

None of the five is among the 88.

⚠️ **`ZigZag` is NOT a casing typo for the registry's `Zigzag`** ([ADR-978](DECISIONS.md)). The
resemblance is a trap: their props only partly overlap — `titleAccent` vs `accentWord`, `side` vs
`mediaSide`, and `kicker` / `tone` / `imgAspect` have no home in `Zigzag` at all — so aliasing one to
the other would **silently drop three fields and mis-map two**, which is the same data loss arriving
by a quieter route. It is a *retired block with a similar name*, and remapping it is a data migration
with real decisions in it.

✅ **Shipped ([ADR-978](DECISIONS.md)).** `isRenderable()` was `content.every(…)`, so publishing
either affected page replaced it with the code template and the draft was gone. The loader now keeps
any well-formed document, the public routes render it minus the unresolvable blocks, and an
unresolvable block shows a labelled placeholder in the editor only. **The five retired types still
render as nothing on a live page** — the fix protects the author's data, it does not restore the
blocks.

### ⚠️ P1 — live placements, cannot drop without a migration

| Where | Types in use |
|---|---|
| 17 space `profileLayout` rows | `business`, `editorial` (17 each) · `contact` (15) · `cardGrid` (14) · `features`, `zigzag` (13) · **`faq` (11)** · `gallery` (10) · `accentBeat` (6) · `events` (3) · `story`, `offerings`, `booking`, `callout` (2) · `photoHero`, `about`, `team` (1) |
| 19 email documents | 13 entity ids |
| 3 spotlight layouts | `quote`, `image`, `links`, `gallery`, `heading`, `embed`, **`stats`** |
| 5 `pages` rows | `Statement`, `MediaText`, `CallToAction`, `Heading`, `Text`, `RolesPath`, `Hero`, `Marquee`, `FeatureGrid`, `CircleFirstNight` |
| 36 `page_settings` rows | **92 module ids** |

🔴 **Two types are already retired from every palette yet live in stored data** — `faq` (11 spaces)
and `stats` (1 spotlight). The fail-safe holds: an existing placement still renders, it just cannot
be re-added. **They must survive E2 as render-only rows.**

🔴 **`event-venue-map`, `event-gallery`, `event-pricing`, `event-sales` are in the parked 11 yet each
has 2 live `page_settings` placements.** They are stripped at *resolve* time, not at *write* time, so
the stored rows still name them. Dropping the definitions turns a silent filter into a hard unknown
id.

🔴 **Email is NOT idle — the measurement behind D-12 was wrong, and is corrected in
[ADR-977](DECISIONS.md).** The original figure, *"8 messages in 30 days"*, was `public.messages` —
the **direct-message table** — which has nothing to do with email. The real numbers:

| Measure | Value |
|---|---|
| `email_events`, 30 days | **704** (297 `sent`, 292 `delivered`, 102 `opened`) |
| … sends tied to a campaign | **196** |
| Most recent send | **today** |
| `campaigns` | **7 draft** (still sendable), 5 sent |
| Queued *right now* | 0 ✅ · `nurture_steps` 0 ✅ |

An empty queue is the **normal state between sends**, not evidence the surface is unused. A rename
cannot corrupt an already-sent email, but it corrupts the **7 draft campaigns and 7 templates that
are still sendable**.

⚠️ **Land the email golden-string harness in E0, before any email-reachable id moves.** It is ~120
lines against a set that is exactly 14 and green today. Until then, a renaming PR must re-run the
queue check *and* render the 7 drafts + 7 templates through `compileEmailDoc` and diff the output.

### ✅ P2 — demonstrably unused

**6 entity blocks** genuinely cold on all three axes: `practices`, `circles`, `updates`, `journeys`,
`reviews` and **`topfriends`** — subject to `frq/programs` / `frq/people` absorbing their capability.
⚠️ **Not** `productCard` (the only email path to a live catalog card) or `recording` (the ADR-608
Airwaves block) — both are **new, not dead**.

**4 genuinely dead Puck types**: `LiveStats`, `LiveEvents`, `LivePosts` (never placed anywhere, pure
duplicates of `stats`/`events`/`updates`) and `CirclesChannelNav`.

⚠️ **66 Puck types have no live placement** — only 22 of the 88 appear in any stored document — **and that list is a trap.** Three reasons it is not a
retirement list: the seven design types (`PhotoHero`…`Prose`) are cold *as Puck names* while their
entity counterparts are the most-placed blocks in the system (`editorial` 17, `cardGrid` 14,
`zigzag` 13) — retiring the name is free, retiring the component breaks 17 Space profiles; the
primitives (`Container`, `Columns`, `Divider`, `Image`…) can be placed at any moment, so zero
placements means zero *today*; and **65 layout modules were never stored at all** (92 of 157 ids appear across the 36
`page_settings` rows), which means "never rearranged," not "never rendered" — the resolver falls back to code defaults, so retiring one still
changes a live page.

---

## E. Sequenced retirement gate

1. Fix the 5 orphan types + unknown-block preservation *(the hotfix)*.
2. Land `check:doc-safety` with these documents as its first corpus.
3. Retire the 4 dead Puck rows and 5 dead entity rows — **no migration needed**.
4. Only then collapse anything with a live placement, **each behind `render_path`**.

The six queries behind §D **are** the `block_usage` index's first implementation. Build it from them,
and treat this section as its expected output.
