# Naming Canon 2026 — Phase 0 Content Inventory (member-facing)

**Status: ⏳ read-only inventory — no renames performed.**
Scope: every string a member or visitor can read — help/program markdown, UI strings in
`app/**` + `components/**`, email/notification/onboarding copy, Vera prompts, SEO/AIO
surfaces, marketing pages. Branch `naming-canon-2026`, inventoried 2026-06-10.

**Headline:** 9 help articles, ~14 code files, 1 email pipeline, 1 marketing page, and a
set of **DB-seeded names** carry retired terms. **ZERO URL changes are required or
proposed** — one help slug (`/help/groups/circle-field`) embeds a retired word and is
flagged below to be kept as-is. Several canon labels ("Circle Current", "Co-op", "Adept")
do **not yet exist anywhere** — see Open Questions.

Legend: ✅ rename (member-visible retired term) · ⚠️ ambiguous (needs a call) · ⏺ keep
(collision — same word, different concept) · 🔴 loud flag.

---

## 1 · Retired terms — occurrence tables

### 1.1 Spark / Current / Deep (intensity-tier labels)

The labels live in **one central source** — `components/journey/tier-meta.ts` — and every
UI surface renders from it. The help articles hardcode them.

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| Spark/Current/Deep | `components/journey/tier-meta.ts` :17–19 | 3 labels + 3 blurbs | ✅ rename (central) | `Spark` ⚡ / `Current` 🌊 / `Deep` 🏔️ + blurbs "Minimum viable — the worst-day version." / "Standard. The default depth." / "Full expression — the deepest take." |
| (renders via TIER_META) | `components/journey/tier-control.tsx` :75, 82 · `next-step-card.tsx` :61 · `step-checklist.tsx` :137 (aria-label/title) · `discovery-widgets.tsx` :69 · `components/studio/journey/journey-sections.tsx` :139 | 5 surfaces | ✅ inherits central rename | tier label + blurb tooltip on journey pages, step checklist, studio picker |
| Spark/Current/Deep | `content/help/the-game/your-journey.md` :27–29 | 3 | ✅ rename | "**Spark** — the 5–10 minute version. Low friction…", "**Current** — the standard form (the default).", "**Deep** — the full expression: longer, or with facilitation." |
| Spark, Current, Deep | `content/help/sharing/build-a-journey.md` :29–30 | 1 | ✅ rename | "…choose its default **depth** (Spark, Current, or Deep) for people who follow it." |
| Spark (collision — legacy profile ladder) | `app/(main)/people/[handle]/page.tsx` :38 | 1 | ⚠️ ambiguous 🔴 | Public-profile `RANK_TIERS`: `Ghost / Spark / Flame / Blaze / Inferno` — a **divergent legacy ladder** that matches neither the rank canon nor the tier set. Rename or delete (Open Q7). |
| Spark (collision — milestone badge) | `app/(main)/people/[handle]/page.tsx` :210 | 1 | ⚠️ ambiguous | Badge `Spark` — "50 zaps earned" on public profiles |
| Spark (collision — streak milestone) | `lib/streak.ts` :18 → renders `app/(main)/crew/streaks/page.tsx` :114–127 | 1 | ⚠️ ambiguous | Day-3 streak milestone label `Spark` ("Spark · 3 days · +10 zaps") |
| Sparked (collision — DB achievement) | `supabase/migrations/20240118000000_gamification.sql` :352 | 1 | ⚠️ DB data, out of code scope | Achievement `Sparked` — "Earn your first 100 zaps in a season" |
| Spark/Deep (collision — demo titles) | `lib/demo/engine.ts` :485 | 2 | ⏺ keep | Demo journey names "Creative Spark", "Deep Focus" (titles, not tier labels) |
| `Sparkles`/`Sparkle` icon imports | many files | — | ⏺ keep | lucide icon name, never rendered as text |
| "current" (collision) | e.g. "current season", "current streak", `current_season_zaps` | many | ⏺ keep | English usage + DB columns; only the **tier label** 'Current' renames (→ 'Adept' per brief) |

### 1.2 Runner / Operative / Agent (season-rank labels)

Central source **`lib/season-ranks.ts`** (`SEASON_RANKS` + `RANK_LABELS`); ~15 surfaces
render from it (leaderboard, crew dashboard/store/journey, profile flair, page-header,
post-replies flair, circle members list, rail panels, game-stats dock, app-shell,
admin member manager). Hardcoded copies exist in help, marketing, page templates.

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| Runner/Operative/Agent | `lib/season-ranks.ts` :21–23, :32–34 | 6 | ✅ rename (central) | labels `Runner`, `Operative`, `Agent` (Ghost/Conduit/Luminary keep) |
| Runner/Operative/Agent | `content/help/the-game/season-ranks.md` :19–21 | 3 | ✅ rename | "**Runner**: at 100 zaps" / "**Operative**: at 300 zaps" / "**Agent**: at 750 zaps" |
| Runner | `content/help/the-game/achievements.md` :35 | 1 | ✅ rename | "**Runner Unlocked** — reach your first season rank" |
| Runner/Operative/Agent | `app/(marketing)/the-quest/page.tsx` :64, :70, :76 | 3 | ✅ rename | Public rank ladder: "Runner · Showing up", "Operative · Known by name", "Agent · Holding the door" |
| Runner/Operative/Agent | `lib/page-editor/templates/the-quest.ts` :100–102 | 3 | ✅ rename (+ 🔴 already-seeded pages, see §4 Q8) | page-template cards "Runner · Showing up…" etc. |
| Operative | `lib/member-progress.ts` :88 (renders in `components/progress/stage-strip.tsx` on the feed) | 1 | ✅ rename | checklist item "Climb to Operative rank" |
| Agent | `lib/rewards/rules.ts` :40–41 (renders on `/admin/rewards`) | 2 | ⏺ keep (operator-only) — update for consistency when ranks rename | "Seasoned — reached Agent" |
| Runner/Operative/Agent (DB seeds) | `supabase/migrations/20240118000000_gamification.sql` :356–358, :376 | 4 | ⚠️ 🔴 DB data — member-visible achievement/challenge names need a **data migration**, not a code edit | "Runner Unlocked", "Operative Unlocked", "Agent Unlocked", challenge "Task Runner" |
| rank enum values | `season_rank_enum` ('runner','operative','agent') in DB + `lib/season-ranks.ts` keys | — | ⏺ keep (internal ids) | never shown directly — **except the digest email bug, §3** 🔴 |
| Agent (collision — AI) | `app/(main)/admin/vera/page.tsx` :38 "Agent console" · `app/(main)/marketing/agent/page.tsx` :16 "Agent Console" · `app/(main)/marketing/page.tsx` :64 · `lib/ai/vera/agent-claude.ts` | many | ⏺ keep | operator/AI "agent" — explicitly keeps per collision guard |
| Runner (collision) | `lib/ai/vera/agent-claude.test.ts` :43 "The Sunset Runners" · `app/(main)/admin/demo/grow-network.tsx` :107 "Cardiff Trail Runners" | 2 | ⏺ keep | example circle names, not rank labels |

### 1.3 "Seasonal Quest"

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| Seasonal Quests | `app/(main)/journeys/page.tsx` :139 | 1 | ✅ rename | section heading "Seasonal Quests" ("The season's official Quests — guided tracks of practices…") |
| Seasonal Quest(s) | `components/studio/journey/journey-sections.tsx` :369, :386 | 2 | ✅ rename | studio field label "Seasonal Quest"; "No active Seasonal Quests to assign yet." |
| Seasonal Quests | `app/(main)/crew/quests/page.tsx` :50 | 1 | ✅ rename | empty state "Seasonal Quests appear here when the season opens." |
| (code comments only) | `lib/quests.ts`, `lib/journey-plans.ts` :64, :274, `app/(main)/crew/journeys/page.tsx` :4 | — | ⏺ keep (internal) | not member-visible |

### 1.4 Static / Tuned / Locked / Live (retired status set)

**Not found as a member-facing status set anywhere.** ✅ Nothing to rename. Collisions, all ⏺ keep:

| Word | File : lines | Verdict | Context |
|---|---|---|---|
| Live location | `content/help/connecting/your-location.md` :43–46 · `content/help/getting-started/your-settings.md` :31 | ⏺ keep | feature name (location sharing), not the status set |
| Tuned in / Tune in | `app/(main)/channels/channel-toggle.tsx` :61, :95 · `app/(main)/channels/page.tsx` :169, :299 | ⏺ keep (canon) | the canon "tune in" verb |
| "It's live…" / "goes live" | `components/studio/journey/journey-builder.tsx` :267, :273 | ⏺ keep | plain English ("It's live in the community library…") |
| Season-locked | `components/studio/journey/journey-sections.tsx` :215 | ⚠️ ambiguous | studio toggle "Season-locked" — different sense (anchored to season); confirm it survives the canon |
| Live signal | `app/(main)/marketing/market-read/page.tsx` | ⏺ keep | internal operator console |

### 1.5 "The Drop"

**Zero member-facing occurrences** in content, app, components, lib (email, onboarding,
Vera included). ✅ Nothing to do.

### 1.6 Arc / Arcs

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| season arc | `content/help/the-game/your-journey.md` :43 | 1 | ⚠️ ambiguous | "A progress ring shows the season arc: **8 qualifying weeks of the 13**…" — lowercase, reads as plain English; decide if the word itself is banned |
| /crew/arcs | `app/(main)/crew/arcs/page.tsx` | — | ⏺ keep | legacy redirect to /journeys (ADR-085); no visible text; **URL kept** |
| Arc clock etc. | `lib/journey-arc.ts`, `lib/journey-rewards.ts` :53, `lib/journey-plans.ts` :506, :693, `lib/gems.ts` :17, `components/journey/season-progress.tsx` :5 | — | ⏺ keep (internal) | comments/identifiers; the widget itself renders "Week N of 13", no "Arc" string |

### 1.7 Bolts — 🔴 KNOWN LIVE

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| Bolts | `components/layout/app-shell.tsx` :854 | 1 | ✅ rename | tooltip `title="Bolts (this season)"` on the sidebar zap counter |
| Bolts | `components/layout/app-shell.tsx` :1538–1539 | 2 | ✅ rename | micro-rail `aria-label="Bolts this season"` + `title="Bolts this season"` |
| bolt (collision) | `components/sidebar/demo-notice.tsx` :57–59 | 1 | ⚠️ ambiguous | "Anything with a ⚡ bolt is sample content… Do something real and earn ⚡." — describes the glyph marking demo content, not the currency; recommend rewording anyway to avoid echoing the retired term |

These are the **only** "Bolts" in the codebase — everywhere else already says Zaps.

### 1.8 Field / "Circle Field" / "Building Field"

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| Circle Field / Field | `content/help/groups/circle-field.md` (whole article; frontmatter :2; body :12–42) | ~13 | ✅ rename (🔴 keep slug — see §3) | title "Circle Field"; "**Field** is what your circle builds *together*…"; "a **Circle Field** card shows what you've gathered this season"; "your Field is your circle's business"; "Field exists to say *look what we built together*" |
| Building Field | `content/help/groups/events.md` :45–48 | 3 | ✅ rename | heading "## Building Field together"; "your circle builds **Field** together — a shared measure…"; "A circle's Field stays private to its members…" |
| Field | `content/help/the-game/season-challenges.md` :56 | 1 | ✅ rename | "…the circle's shared [Field](/help/groups/circle-field) grows. Same game, played side by side." (link **target stays**, link **text** renames) |
| Circle Field | `components/circles/circle-field-standing.tsx` :31, :37–39 | 2 | ✅ rename | card title "Circle Field"; "Every time someone from {circle} shows up to a circle gathering, the Field grows. This is what we've built together this season." |
| (internal) | `lib/events/circle-field.ts`, `lib/achievements.ts` :443, `app/(main)/circles/[slug]/page.tsx` :307, migration `20260610000000_circle_field.sql` | — | ⏺ keep (internal ids/comments) | file/function names out of Phase 0 member-facing scope |
| field (collision) | form-field / `StudioField` / `set_profile_field` / "field hockey"-style usage | many | ⏺ keep | UI plumbing, never the game concept |

### 1.9 Chorus

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| chorus / Chorus | `components/journey/chorus-strip.tsx` :34, :38 | 2 | ✅ rename | "Your circle is in chorus" · "{n} from your circles are on this journey together — a Chorus is forming." |
| Chorus | `content/help/the-game/your-journey.md` :63 | 1 | ✅ rename | "…you form a **Chorus** and keep each other's rhythm." |
| Chorus companions | `lib/journey-page-config.ts` :154 | 1 | ✅ rename | studio page-config widget label "Chorus companions" + hint "Members of your circles on this Journey." |
| (internal) | `lib/journey-chorus.ts`, `lib/journey-chorus.test.ts`, `lib/journey-page-config.ts` :29 | — | ⏺ keep (internal) | identifiers/comments |

### 1.10 Domains / "Domain Journeys"

**Zero member-facing occurrences.** "Domain" exists only in code comments/types
(`lib/discover.ts` :66–81, `app/(main)/channels/page.tsx` :42–62, `app/discover/topics/page.tsx` :32)
— the UI consistently says **"Channels"** for Mind/Body/Spirit/Expression, and
**"Pillars"** on Quest/practice surfaces. ⚠️ See Open Question 9 (Channels vs Pillars).
"Domain Journeys": zero occurrences anywhere.

### 1.11 deshi / sempai / sensei

**Zero occurrences** in content, app, components, lib. ✅ Nothing to do.

### 1.12 "points"

| Term | File : lines | Count | Verdict | Exact member-visible string |
|---|---|---|---|---|
| points | `content/help/the-game/zaps-and-gems.md` :48 | 1 | ✅ rename | "Your Vault keeps a running **points & streaks log**…" |
| points | `content/help/the-game/qr-check-ins.md` :12 | 1 | ✅ rename | "Frequency codes turn showing up in the real world into points." |
| points | `app/(main)/practices/page.tsx` :37 (SEO metadata description) | 1 | ✅ rename | "This is where the points come from — a growing community library…" |
| points | `app/(main)/crew/store/page.tsx` :87 | 1 | ✅ rename | "How you earned — points &amp; streaks log" |
| points | `app/(main)/crew/store/ledger/page.tsx` :117 | 1 | ✅ rename | empty state title "No points yet" |
| Points | `app/(main)/crew/leaderboard/page.tsx` :177 | 1 | ⚠️ ambiguous | "Points" column header on the **Entry points** board (a flyer/QR score, not Zaps) — pick a non-"points" word or confirm keep |
| points (rhetorical) | `app/(marketing)/the-quest/page.tsx` :139, :275, :296, :337 · `app/(marketing)/the-community/tour.tsx` :402 | 5 | ⚠️ ambiguous (lean keep) | deliberate contrast: "You don't grind points…", "You rise… not by farming points", "You're not buying points", "Zaps are gratitude, not points." |
| Entry points | leaderboard tabs/cards, `components/layout/app-shell.tsx` :489, marketing funnels | many | ⏺ keep | different concept (QR entry points) |
| points (verb) | "Vera points you toward…", "it points to your profile" (`your-first-week.md` :3, `qr-check-ins.md` :38, etc.) | many | ⏺ keep | plain English |
| points, perks | `lib/onboarding/personas.ts` :102 | 1 | ⏺ keep | venue-partner loyalty pitch ("points, perks, and real reasons to come back") — not game currency |

---

## 2 · Canon labels — presence check

| Canon term | Present member-facing? | Where (sample) |
|---|---|---|
| The Quest | ✅ | nav section `lib/nav-areas.ts` :80–84; invite email `lib/email.ts` :123 "invited you to join The Quest"; `/the-quest` marketing page; crew eyebrow |
| Journey | ✅ | /journeys, help your-journey.md, studio |
| Practice | ✅ | /practices, help practices.md, Vera welcome deck |
| Challenge | ✅ | /crew/challenges, help season-challenges.md |
| Task | ✅ | crew tasks, "Task Master" profile badge |
| Pillars (Mind/Body/Spirit/Expression) | ✅ | help practices.md :92–93, build-a-journey.md :24, studio builders, crew/quests description "one per Pillar" |
| Co-op | 🔴 absent | only a code comment (`lib/journey-chorus.ts` :1 "circle co-op completion") |
| Circle Current | 🔴 absent | zero occurrences anywhere |
| The Vault | ✅ | nav label, game-stats-dock :189, ledger eyebrow, help the-vault.md |
| Vault Store | ✅ | /crew/store title :55, ledger back-link :62, help the-gem-store.md :2 |
| Zaps | ✅ | ubiquitous (UI, help, email, onboarding) |
| Gems | ✅ | ubiquitous |
| "tune in" | ✅ | channel-toggle buttons "Tune in"/"Tuned in", channels pages, help channels.md/messages.md |
| Outpost | ✅ | `components/compose/new-nexus-compose.tsx` :65 label "Outpost *"; admin channel scopes |
| Rank names | ⚠️ partial | Ghost/Conduit/Luminary keep; Runner/Operative/Agent retire with **no canonical replacements specified** (Open Q1). 'Adept' (named in the brief for the 'current' tier) appears nowhere yet. |

---

## 3 · Surface lists

### 3.1 Help articles needing edits (9; `content/programs/**` is clean)

| Article | Terms |
|---|---|
| `content/help/the-game/your-journey.md` | Spark/Current/Deep (:27–29), Chorus (:63), "season arc" (:43 ⚠️) |
| `content/help/sharing/build-a-journey.md` | Spark/Current/Deep (:29–30) |
| `content/help/the-game/season-ranks.md` | Runner/Operative/Agent (:19–21) |
| `content/help/the-game/achievements.md` | "Runner Unlocked" (:35) |
| `content/help/groups/circle-field.md` | title + Field/Circle Field throughout — 🔴 keep filename/slug |
| `content/help/groups/events.md` | "Building Field together" (:45–48) |
| `content/help/the-game/season-challenges.md` | Field link text (:56) — keep the `/help/groups/circle-field` href |
| `content/help/the-game/zaps-and-gems.md` | "points & streaks log" (:48) |
| `content/help/the-game/qr-check-ins.md` | "into points" (:12) |

### 3.2 Email / notification templates needing edits

| Surface | Finding |
|---|---|
| `lib/email.ts` weekly digest (:642, :679, :709, :716 — renders `rank.name`) | 🔴 `lib/digest.ts` :165–166 passes the **raw enum value** (`'runner'`, `'operative'`, `'agent'`) as the displayed rank name — members already receive the lowercase retired word in email. The rename must route this through the (new) label map; fixing the casing bug comes free. |
| All other email templates (`lib/email.ts` welcome, invites, event reminders/RSVP, dispatch, beta) | ✅ clean — "The Quest", "zaps" are canon |
| Notification copy (`lib/notifications-map.ts`, `lib/push.ts`, `app/api/cron/lifecycle-triggers`, friend/feed actions, support) | ✅ clean — no retired terms |
| Onboarding (`lib/onboarding/**`, `app/onboarding/**`, `components/onboarding/**`) | ✅ clean — welcome deck (`vera-welcome.ts` :106) and training links (`training.ts` :40–42) already speak canon (zaps, gems, ranks, Vault) |
| Vera prompts (`lib/ai/vera/agent-claude.ts` :121) | ✅ clean — teaches "zaps, ranks, journeys, circles" generically; re-check after new rank/tier names land so she teaches them by name |

### 3.3 SEO / AIO surfaces affected — 🔴 ZERO URL CHANGES

| Surface | Finding | URL change? |
|---|---|---|
| `/help/groups/circle-field` (frontmatter title → `<title>` "Circle Field \| Help", og/twitter card, breadcrumb) | Title and body rename; **slug/filename keeps** | **NO** — 🔴 the slug embeds the retired word "field"; we deliberately keep it (renaming the file would change the URL, which is forbidden in this phase) |
| `app/(main)/practices/page.tsx` :37 metadata description | "…where the points come from…" → rename; meta-only | NO |
| `app/(marketing)/the-quest/page.tsx` :55–90 | Crawlable rank ladder (Runner/Operative/Agent) in body copy + ⚠️ rhetorical "points" lines; metadata title "The Quest" is canon | NO — route stays `/the-quest` |
| `app/(main)/channels/page.tsx` :21–28 metadata fallback (ADR-180 operator-editable) | "The four Channels — Mind, Body, Spirit, and Expression… tune into" — canon-compatible except the Channels/Pillars question (Q9) | NO |
| OG images (`app/opengraph-image.tsx`, `twitter-image.tsx`, `app/discover/events/[slug]/opengraph-image.tsx`) | ✅ clean — brand wordmark/tagline and event names only; no game terms baked in | NO |
| JSON-LD (help articles, discover events/circles/topics) | Names derive from frontmatter titles / DB rows → "Circle Field" appears in help JSON-LD until the article retitles; discover is clean | NO |
| Discover pages (`app/discover/**`) | ✅ clean — "tune in" already canon (`topics/[slug]/page.tsx` :132); no retired terms | NO |
| `sitemap.ts` / `robots.ts` / redirects | `/crew/arcs` legacy redirect keeps; no sitemap entries change | NO |

**No route, slug, or sitemap entry changes anywhere in this inventory.**

---

## 4 · Open questions

1. **Replacement rank names** for Runner / Operative / Agent are not specified in the
   brief. Blocking for §1.2 (and the DB seeds in Q8). Ghost/Conduit/Luminary keep?
2. **Replacement tier names**: the collision guard gives `Current → Adept`; what do
   Spark and Deep become? Blocking for §1.1.
3. **"Seasonal Quest" replacement** — does it fold into "The Quest" (e.g. "this season's
   Quest") or become "Challenge"? Affects 4 strings + the `/crew/quests` page copy.
4. **Chorus → Co-op?** "Co-op" is canon but absent; confirm Chorus's 4 member-visible
   strings map to Co-op (and what the forming-state line becomes).
5. **Field → "Circle Current"?** Confirm the mapping, and confirm the
   `/help/groups/circle-field` slug stays untouched (assumed YES per zero-URL mandate).
   Note the collision this creates: "Circle Current" (group score) vs the retired tier
   label "Current" vs "current season" — the help article will need careful wording.
6. **"Gem Store"** is used alongside "Vault Store" (`app/(main)/crew/page.tsx` :444
   QuickLink "Gem Store"; `crew/store/page.tsx` :56 "…the Gem Store in one place";
   help `the-gem-store.md` title "Spending gems — the Vault Store"). Canon lists only
   "Vault Store" — is "Gem Store" retired?
7. **Legacy public-profile ladder** `Ghost/Spark/Flame/Blaze/Inferno`
   (`app/(main)/people/[handle]/page.tsx` :36–41) duplicates neither canon — rename it
   to the real rank ladder or delete it?
8. **DB-seeded member-visible names** need a **data migration**, not code edits:
   achievements "Sparked", "Runner Unlocked", "Operative Unlocked", "Agent Unlocked",
   challenge "Task Runner" (migration `20240118000000_gamification.sql`), plus any
   already-published pages created from `lib/page-editor/templates/the-quest.ts`
   (rank-named cards live in `pages` rows). Is that in scope for this canon pass?
9. **Channels vs Pillars**: the four Mind/Body/Spirit/Expression rows are "Channels" on
   /channels and in its SEO fallback, but "Pillars" in help, studio, and crew copy.
   Canon lists Pillars — does "Channels" (the surface) survive as a distinct concept?
10. **Digest email rank bug** (`lib/digest.ts` :166): raw enum leaks as the display name
    ("runner"). Fix alongside the rename, or as a separate bugfix first?
11. **"Spark" the streak/profile milestones** (day-3 streak label, 50-zap badge) — same
    word, different concept. Rename for hygiene or keep?
12. **Rhetorical "points"** on marketing surfaces ("Zaps are gratitude, not points") —
    deliberate contrast that arguably *supports* the canon. Keep or rephrase?
13. **demo-notice "⚡ bolt"** (`components/sidebar/demo-notice.tsx` :57) — refers to the
    glyph marking demo content, not the currency; reword while touching app-shell?
14. **"season arc"** (your-journey.md :43, lowercase) — is the word "arc" itself banned,
    or only "Arc" as a feature name?
