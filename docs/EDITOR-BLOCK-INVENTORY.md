# Block inventory and consolidation map (E2 input)

> **The answer, first.** **304 block rows across five systems**, not the ~138 across three the plan
> first estimated. They map to **~49** with **no capability dropped** — every collapse is a
> `variant`, a `binding.source`, or a `density`. Three fields carry almost all of it:
> `binding.source` collapses **111 layout modules into 4 blocks**.
>
> ⚠️ **~49 is a range, not a commitment** ([ADR-975](DECISIONS.md) D-11). The count moved from 138 to
> 304 on measurement; E2 gets its own planning pass once the usage index shows what is *placed*.
>
> Parent: [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md) §2.1 · Decisions:
> [ADR-972](DECISIONS.md) · [ADR-975](DECISIONS.md).
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
[ADR-975](DECISIONS.md).

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
| … page blocks | 124 | 34 |
| … operator widgets | 157 | 15 (28 absorbed by Tier A) |
| Block **systems** | **5** | **1** |

Every one of the 304 maps to exactly one target, with no unmapped remainder.

---

## D. Retirement risk — measured against the live database

### 🔴 P0 — five stored types resolve to nothing ([ADR-975](DECISIONS.md) D-9)

| Slug | Status | Orphan types |
|---|---|---|
| `about` | draft | `BetaCTA`, `ImageBand`, `PageHero`, `ZigZag` |
| `how-it-works` | draft | `BetaCTA`, `PageHero`, `ZigZag` |
| `the-lab` | draft | `BetaCTA`, `FeatureGallery`, `ImageBand`, `PageHero`, `ZigZag` |

None of the five is among the 88. **Note `ZigZag` against the registry's `Zigzag` — a pure casing
divergence.** A block was renamed and three documents were quietly orphaned, which is the clearest
possible argument for byte-for-byte unknown-block preservation.

Because `isRenderable()` is `content.every(…)`, **publishing any of these three replaces it with the
code template and the draft is gone.** `home` and `the-community` are clean, so nothing public is
broken — the trap is armed, not sprung. **Fixed by a standalone hotfix PR, ahead of the program.**

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

✅ **Email is not frozen** ([ADR-975](DECISIONS.md) D-12). Verified: **0 campaigns scheduled or
sending**, **0 nurture steps**, 8 messages in 30 days. A block-id change cannot corrupt an outbound
send because there is none. ⚠️ **Re-run that check before any PR renaming an email-reachable id** —
the decision rests on a measurement, and measurements expire.

### ✅ P2 — demonstrably unused

**5 entity blocks** genuinely cold on all three axes: `practices`, `circles`, `updates`, `journeys`,
`reviews` — subject to `frq/programs` absorbing their capability.
⚠️ **Not** `productCard` (the only email path to a live catalog card) or `recording` (the ADR-608
Airwaves block) — both are **new, not dead**.

**4 genuinely dead Puck types**: `LiveStats`, `LiveEvents`, `LivePosts` (never placed anywhere, pure
duplicates of `stats`/`events`/`updates`) and `CirclesChannelNav`.

⚠️ **31 Puck types have no live placement, and that list is a trap.** Three reasons it is not a
retirement list: the seven design types (`PhotoHero`…`Prose`) are cold *as Puck names* while their
entity counterparts are the most-placed blocks in the system (`editorial` 17, `cardGrid` 14,
`zigzag` 13) — retiring the name is free, retiring the component breaks 17 Space profiles; the
primitives (`Container`, `Columns`, `Divider`, `Image`…) can be placed at any moment, so zero
placements means zero *today*; and **64 layout modules were never stored at all**, which means "never
rearranged," not "never rendered" — the resolver falls back to code defaults, so retiring one still
changes a live page.

---

## E. Sequenced retirement gate

1. Fix the 5 orphan types + unknown-block preservation *(the hotfix)*.
2. Land `check:doc-safety` with these documents as its first corpus.
3. Retire the 4 dead Puck rows and 5 dead entity rows — **no migration needed**.
4. Only then collapse anything with a live placement, **each behind `render_path`**.

The six queries behind §D **are** the `block_usage` index's first implementation. Build it from them,
and treat this section as its expected output.
