# Circles C3 — remove Space Communities, replace it with Circles

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

**Status:** ✅ **approved by the owner 2026-08-19** (OWN-015, verbatim *"Remove Communities,
replace with circles."*). The build is [LIVE-059](BUILD-BACKLOG.json); the ratified slice sequence
and the design decisions are [ADR-1091](DECISIONS.md), which amends §6 and §9 below in place.
**Authority:** [ADR-1091](DECISIONS.md) (the design ruling) · [ADR-1013](DECISIONS.md) §3 (the
removal ruling) · [ADR-1015](DECISIONS.md) (Circle privacy, two axes) · [ADR-1014](DECISIONS.md)
(Circle roles) · [ADR-584/585/586/587](DECISIONS.md) (what Space Communities is, and why each half
exists).
**Scope:** the Space-level Community feed only. White Label / per-tenant sites are out of scope and
appear nowhere below.
**Date:** 2026-08-12 · verified against production `azsqfeonabsbmemvddqd` by read-only query.
**Re-verified 2026-08-20** (design pass, ADR-1091): every §2.1 count and the §7.1 layout count
held exactly; the Circle substrate refined to 2 active + 2 forming + 3 draft, all `access='open'`,
across 2 Spaces.

---

## The answer in one table

| # | Question | Answer | Status |
| :-- | :-- | :-- | :-- |
| 1 | What is Space Communities? | One route, `/spaces/<slug>/community`: a Facebook-style wall on every Space profile. Brand Updates + follower posts, with reactions and comments. Four files, ~1,300 lines, 9 server actions. | ✅ fully mapped |
| 2 | How much live data? | **Zero.** 0 `space_updates`, 0 `space_update` posts, 0 comments, 0 reactions, 0 notifications, 0 uploaded images. Every table behind it is empty. | 🔴 nothing to migrate |
| 3 | How many surfaces? | 1 route · 1 always-on profile tab · 1 page-editor block · 1 section anchor · 1 notification destination · 9 actions · 0 admin-menu rows · 0 help articles. | ✅ small blast radius |
| 4 | Does a Circle replace it? | **Partly.** Roster, room, roles and privacy: yes, shipped. **Reaching everyone who follows the Space: no. Nothing replaces that**, and `access = 'space_members'` does not, for the reason in §4.2. | ⚠️ one real gap |
| 5 | What happens to live Communities? | There are none. **Recommend hard delete of the feature; leave `space_updates` alive** as the brand-Updates backend it also serves. | ✅ approved (ADR-1091) |
| 6 | Did the owner rule "archive communities"? | **No such ADR exists.** The archive-only ruling is ADR-879 and it governs **Channels**, not Communities, and ADR-882 later gave Channels a real delete anyway. §5.1 quotes both rather than re-deciding. | ✅ ruled: hard delete (OWN-015 + ADR-1091) |
| 7 | Biggest risk? | The `SpaceCommunity` **block** is misnamed: it renders **Circles**, and 18 of 20 live Spaces have it in a saved layout. An unknown block type is silently skipped (ADR-978), so renaming the key without a jsonb rewrite **silently deletes the Circles section from 18 live pages**. | 🔴 gated on §7.1 |
| 8 | Broken bookmarks? | `/spaces/<slug>/community` for all 20 Spaces, plus the notification destination that hardcodes it. Both need a 308 to the Space root. | ⚠️ handled in §6 |

**Recommended shape:** delete the wall, keep the backend it shares, rename the misnamed block **in
place** (label and anchor only, never the type key), add the Circles tab the ADR promised, and ship
the follower-reach gap as its own decision rather than pretending a Circle already covers it.

---

## 1 · What Space Communities actually is

### 1.1 The feature

A **Community** is the always-present `Community` tab on every Space profile
(`lib/spaces/profile-nav.ts:77`). It is a two-column page: a wall on the left, a rail of business
info on the right.

| Half | Built by | Evidence |
| :-- | :-- | :-- |
| The tab | unconditional, no function gate, on every Space | `lib/spaces/profile-nav.ts:75-77` |
| The route | `SpaceCommunityPage`, 92 lines, seven parallel reads | `app/(main)/spaces/[slug]/(profile)/community/page.tsx:36-92` |
| The wall | brand Updates ∪ follower posts, merged newest-first | `lib/spaces/content-data.ts:424-470` (`getSpaceCommunityFeed`) |
| The rail | About, contact, events, practices, **circles**, booking | `components/spaces/community/space-community-rail.tsx:34-52` |
| The UI | composer, reaction bar, comment thread, moderation | `components/spaces/community/space-community-feed.tsx` (514 lines) |
| The writes | 9 server actions | `lib/spaces/content-actions.ts` (see §3.2) |

Public read for anyone. Interaction is **follower-gated**: only someone with a `space_follows` row
(or an operator) may react, comment, or post (ADR-584 §1). The operator can switch follower posting
off entirely via `preferences.communityMemberPosts` (ADR-586 §2, `lib/spaces/content-actions.ts:203`).

### 1.2 The four things that are NOT Space Communities

The plan is worthless if these blur, so they are separated here with their live counts.

| Thing | Table | Live rows | What it actually is |
| :-- | :-- | :-- | :-- |
| **A Space Community** | `space_updates` + `posts(post_type='space_update')` | **0 + 0** | The public wall on the Space profile. Audience: **followers** (`space_follows`, 7 rows). |
| **The `space_members` roster** | `space_members` | **26**, every one `role='admin'` | The Space's **staff/team ladder**: `viewer < editor < moderator < admin` (`lib/spaces/membership.ts:28`). This is an authz primitive, not an audience. |
| **Membership TIERS** | `space_membership_tiers` / `space_memberships` | **4 tiers / 2 members** | What a Space **sells**. A tier may link one Circle (`space_membership_tiers.circle_id`, ADR-859); **0 do today**. |
| **A Space's Circles** | `circles WHERE space_id IS NOT NULL` | **7** (2 unlisted, 0 closed) | The groups the Space runs. Roster is `memberships` (10 active). |

⚠️ **`space_members` and `space_memberships` are different tables with near-identical names and
disjoint populations.** §4.2 turns on exactly this.

### 1.3 What Space Communities is not, in the code

- ~~It is **not** `/spaces/<slug>/circles`. That route exists but is an **owner-only manager** and
  `notFound()`s on any viewer who cannot edit the Space. **No public Circles tab exists on a Space
  profile today.**~~
  **CORRECTED 2026-08-21 ([ADR-1094](DECISIONS.md), LIVE-082).** True when written, and the owner
  reported the consequence six weeks later as *"right now no page shows up"*. `/spaces/<slug>/circles`
  is the **public tab** now, in the `(profile)` route group; the owner manager moved to
  `/spaces/<slug>/manage/circles`, which is the split Shop already runs.
- It is **not** the `SpaceCommunity` block. That block is labeled `'Circles (live)'` and renders the
  Space's live Circles (`components/page-editor/blocks/profile.tsx:769-775`, `:2038-2047`). It is
  already the Circle surface, wearing the wrong name.
- It is **not** Reviews. That is its own tab, its own table, its own function gate
  (ADR-585; `space_reviews`, 1 live row). Out of scope; it stays.

---

## 2 · The data

### 2.1 Live row counts (production, read-only, 2026-08-12)

| Table / column | Rows | Verdict |
| :-- | --: | :-- |
| `space_updates` (all) | **0** | 🔴 empty |
| `space_updates` (published) | **0** | 🔴 empty |
| Spaces with any Update | **0 of 20** | 🔴 empty |
| `posts` where `post_type='space_update'` | **0** | 🔴 empty |
| ↳ top-level (follower wall posts) | **0** | 🔴 empty |
| ↳ replies (comments) | **0** | 🔴 empty |
| `post_reactions` on those posts | **0** | 🔴 empty |
| `notifications` where `type='space_update'` | **0** | 🔴 empty |
| `storage.objects` under `spaces/*/community/*` | **0** | 🔴 empty |
| Spaces carrying `preferences.communityMemberPosts` | **0 of 20** | 🔴 nobody ever flipped the toggle |
| — | | |
| `spaces` (active) | 20 | context |
| `space_follows` | 7 | the Community's would-be audience |
| `circles` (all with a `space_id`) | 7 | the replacement's substrate |
| `memberships` (active, Circle rosters) | 10 | |
| `posts` where `visibility='group'` (Circle posts) | 9 | |

**The feature has never been used once in production.** Not one Space posted, not one member
commented. That single fact collapses most of the decision space: there is no data migration, no
member content at risk, and no "what happens to their members" question, because there are no
members of a thing nobody created.

### 2.2 The schema behind it

`space_updates` — `id, space_id, author_profile_id, title, body, image_url, post_id, status,
published_at, created_at, updated_at`. Note there is **no `hidden_at` and no `pinned_at`**: pinning
rides `posts.is_pinned` on the anchor (`lib/spaces/content-data.ts:461`), and hiding a brand Update
is a hard `DELETE` (`lib/spaces/content-actions.ts:385-400`).

⚠️ **`space_updates` is not exclusively a Community table.** It also backs the `SpaceUpdates`
page-editor block, the brand blog-style feed on a Space's Home
(`components/page-editor/blocks/spaces.tsx:371`, `lib/entity-blocks/block-data-sources.ts:246`).
Deleting the table would take out a second, separately-decided feature. §5.2 keeps it.

### 2.3 RLS

| Policy | Table | Shape |
| :-- | :-- | :-- |
| `space_updates_public_read` | `space_updates` | `status='published'` AND the Space is active and not private-without-membership |
| `space_updates_operator_{insert,update,delete}` | `space_updates` | `private.can_write_space_content(space_id)` |
| `posts: read by visibility (crew+, space update, or public)` | `posts` | includes an arm `get_my_profile_id() IS NOT NULL AND hidden_at IS NULL AND private.is_space_update_post(id)` |
| `posts: insert (crew+ in scope or space-update comment)` | `posts` | includes an arm for any signed-in author replying under a `space_update` anchor |
| `post_reactions: read / insert own / delete own` | `post_reactions` | three policies, each carrying an `is_space_update_post(post_id)` arm |

🔴 **The `is_space_update_post` carve-out grants every signed-in profile read on every
`space_update` post, platform-wide, with no Space-membership term at all.** That was deliberate for a
public business wall (ADR-584 §1: "Everyone sees the Community tab, every post, comment, and
reaction"). It is the widest read grant in this feature and it is the thing that must **not** survive
into any Circle-shaped successor — see §7.2.

---

## 3 · The surfaces

### 3.1 Everything a human can reach

| Surface | Location | Gated by | Dies? |
| :-- | :-- | :-- | :-- |
| Route `/spaces/<slug>/community` | `app/(main)/spaces/[slug]/(profile)/community/page.tsx` | nothing | ✅ delete |
| Profile tab "Community" | `lib/spaces/profile-nav.ts:77` | **nothing — always shown** | ✅ delete |
| Tab metadata / canonical | same route, `:27-34` | — | ✅ delete |
| Feed component | `components/spaces/community/space-community-feed.tsx` | — | ✅ delete |
| Rail component | `components/spaces/community/space-community-rail.tsx` | — | ✅ delete |
| Duplicate-anchor suppression | `lib/spaces/profile-nav.ts:57` (`DEDICATED_TAB_ANCHORS`) | — | ⚠️ edit (drop `'community'`, keep `'reviews'`) |
| Section anchor `community` | `lib/spaces/section-anchors.ts:59` | — | ⚠️ rename to `circles` |
| Block `SpaceCommunity` (renders **Circles**) | `components/page-editor/blocks/profile.tsx:769,2038` | — | 🔴 **keep the type key** — §7.1 |
| Block registered in the editor palette | `lib/page-editor/config.tsx:113` | — | ⚠️ relabel only |
| Block in the default Space template | `lib/page-editor/templates/space-default.ts:113-118` | — | ⚠️ relabel only |
| Section presence flag `community` | `lib/spaces/content-data.ts:695` | — | ⚠️ rename to `circles` |
| Notification destination | `lib/notifications/href.ts:62` → `/spaces/<slug>/community` | — | 🔴 must repoint before the route dies |
| `revalidatePath('/spaces/<slug>/community')` | `lib/spaces/content-actions.ts:58` | — | ✅ delete |
| Page-chrome rail | `lib/layout/page-chrome.ts` — falls through to `'global'`, **no explicit entry** | — | ✅ no edit needed |

### 3.2 The server actions

Nine, all in `lib/spaces/content-actions.ts`:

| Action | Line | Fate |
| :-- | --: | :-- |
| `createMemberPost` | 106 | ✅ delete |
| `uploadCommunityImage` | 149 | ✅ delete |
| `pinCommunityPost` | 184 | ✅ delete |
| `setCommunityMemberPosts` | 203 | ✅ delete |
| `removeCommunityPost` | 231 | ✅ delete |
| `reactToSpaceUpdate` | 649 | ✅ delete |
| `commentOnSpaceUpdate` | 689 | ✅ delete |
| `createSpaceUpdate` / `updateSpaceUpdate` / `deleteSpaceUpdate` | 265 / 337 / 385 | ⚠️ **keep** — the brand Updates block (§2.2) |

Readers: `getSpaceCommunityFeed` (`lib/spaces/content-data.ts:424`) and its private helper
`getSpaceMemberPosts` (`:388`) both die. `getSpaceUpdates` (`:307`) and `getSpaceCommunity` (`:1000`,
which despite its name reads **Circles**) both stay.

### 3.3 What is NOT on the list

- **No admin-menu row.** `SPACE_MODULES` (`lib/admin/modules/space-modules.ts`) has 34 rows and
  **none of them is `space.community`**. The operator toggle lives inside the feed component itself.
  So the MENU-CONTRACT (ADR-553) is untouched by this work: no catalog row to add or remove, and
  `pnpm check:menu` cannot fire.
- **No help article.** `content/help/**` has 10 categories including `spaces/` (billing,
  plans-and-pricing, space-crm). **Nothing documents the Community tab.** Nothing to retire.
- **No `SpaceFunctionKey`.** The 22-key registry (`lib/spaces/functions.ts:47-69`) has `reviews`,
  `circles`, `practices`, `journeys` — and no `community`. Nothing to remove.
- **No `nav-areas.ts` entry.** `/admin/community` there is the platform operator console, a different
  thing entirely (`lib/nav-areas.ts:139`).
- **No sitemap entry.** Space profile tabs are not enumerated in `app/sitemap.ts`.

### 3.4 Tests that will need editing

`lib/spaces/content-data.test.ts` · `lib/spaces/content-actions.test.ts` ·
`lib/notifications/href.test.ts:61-68` · `lib/layout/page-chrome.test.ts:130` ·
`lib/entity-blocks/block-data-sources.test.ts` · `lib/page-editor/block-render.test.tsx` ·
`components/page-editor/blocks/profile.blocks.test.ts:22,179` ·
`lib/page-editor/templates/space-default.test.ts:27`.

---

## 4 · What replaces what

### 4.1 The capability map

| Space Communities gives a Space… | The Circle equivalent | Status |
| :-- | :-- | :-- |
| A roster of people | `memberships` on a Circle, with four role rungs | ✅ shipped (ADR-1014) |
| A place to post, react, comment | Circle posts, `visibility='group'`, scoped to `circles.id` (9 live rows) | ✅ shipped |
| Moderation of member content | Circle Admin / Steward rungs on `memberships.volunteer_role` | ✅ shipped (ADR-1014) |
| An on/off switch for member posting | Circle **access** axis: `circle_members` closes the door entirely | ✅ shipped (ADR-1015) |
| Public discoverability of the group | Circle **discoverability** axis: `circles.unlisted`, and a listed-closed Circle is a lead funnel | ✅ shipped (ADR-1015) |
| A members-only room inside a Space | `access = 'space_members'` | ⚠️ shipped but **binds the wrong audience** — §4.2 |
| A room included with a paid tier | `access = 'tier'` + `space_membership_tiers.circle_id` | ✅ shipped, 0 tiers linked |
| A tab on the Space profile listing the group | the `SpaceCommunity` block already renders Circles on Home | ⚠️ exists as a **block**, not a **tab** — §4.3 |
| **Reaching every follower of the Space** | **nothing** | 🔴 **must be built or dropped** — §4.4 |
| A brand blog/Updates feed | `SpaceUpdates` block, unchanged | ✅ untouched |

### 4.2 🔴 `access = 'space_members'` is not the audience you think it is

> **RULED 2026-08-20 (OWN-034, [ADR-1092](DECISIONS.md)): option C.** `space_members` keeps the
> staff ladder and is labelled **"Space team only"**; a new `space_paid_members` mode admits
> active `space_memberships` holders and takes the **"Space members only"** label with the
> sentence this section quotes. Migration `20270319000000_circle_space_paid_members.sql`, proof
> `supabase/tests/circle_space_paid_members.test.sql`.
>
> ⚠️ **Premise correction (the ADR-1082 pattern):** the paragraph below was true on 2026-08-12
> and stale by the time the ruling landed. [ADR-1021](DECISIONS.md), applied the same day this
> plan was written, had already pointed the DB arm at `private.is_space_audience` (staff OR
> active paid membership) — option B's substance was live in production while this section, the
> OWN-034 row, and ADR-1091's restatement all still described a staff-only predicate. Ruling C
> therefore also *narrowed* the live arm back to staff (measured impact nil: 0 closed circles).
> The text below is kept as the record of the original finding.

The shipped mode reads the **`space_members`** table, at both layers:

- app: `app/(main)/circles/actions.ts:113-121` queries `space_members` for `status='active'`
- DB: `private.can_enter_circle` calls `private.is_space_member(p_space_id)`, which is
  `spaces.owner_profile_id = me` **OR** an active `public.space_members` row

`space_members` is the Space's **staff ladder** — `viewer < editor < moderator < admin`
(`lib/spaces/membership.ts:28`), the authz primitive `getSpaceCapabilities` reads. In production it
holds **26 rows and every single one is `role='admin'`**.

The Space's **paying** members are `space_memberships` (2 rows). Its **followers**, who were the
Community feed's actual audience, are `space_follows` (7 rows). **Neither table is consulted by any
Circle access mode.**

So the obvious sentence — *"convert each Community to a Circle with `access='space_members'`"* —
would hand the room to the operator's admins and lock out every follower and every paying member.
The member-facing label is `'Space members only'` and the hint is *"Anyone with an active membership
in your Space can join themselves"* (`lib/circles/visibility.ts:66,76`), which an operator will read
as their paying members. 🔴 **That copy is already wrong today, independently of C3**, and should be
fixed whatever the owner rules here.

**Three ways out, for the owner to pick:**

| Option | Change | Trade-off |
| :-- | :-- | :-- |
| **A. Leave it, fix the copy** | relabel the mode "Space team only" | ✅ zero risk, ✅ honest · ❌ leaves paying members with no mode of their own |
| **B. Widen `is_space_member` to include active `space_memberships`** | one SQL function + one app predicate | ✅ matches the shipped copy and the owner's own words in ADR-1015 · ⚠️ **widens access on a live predicate** — needs its own pgTAP proof, and today would admit 2 more people to 0 circles (no circle is closed) |
| **C. Add a sixth mode `space_paid_members`** | new enum value, new trigger arm, new UI row | ✅ leaves every existing grant untouched · ❌ a sixth mode on an axis the ADR wanted kept small |

**Recommendation: B, shipped as its own change with its own proof, before C3 ships anything that
depends on it.** ADR-1015 §5 quotes the owner as *"a private circle that space members can only
access if they are a member"* — a Space's members, in the owner's language, are the people who joined
it, not the staff who run it. But B widens a live authorization predicate, so it is a security change
and does not belong buried inside a feature removal.

### 4.3 The Circles surface ADR-1013 promised does not exist yet — ✅ **BUILT 2026-08-21**

> **ADR-1013 §3:** "Space Communities is removed. A Space's community is its **Circles**. The Space
> keeps a first-class Circles surface, which is now gated on its own `circles` `SpaceFunctionKey`."

~~What exists today: an **owner-only manager** at `/spaces/<slug>/circles` (`:37` `notFound()`s a
non-editor), and a **block on Home** that lists live Circles. What does not exist: a public
`Circles` **tab** in `buildSpaceProfileNav`. If the Community tab is deleted and nothing takes its
place, a Space profile loses a tab and gains none. That is C3's build half.~~

**CLOSED 2026-08-21 ([ADR-1094](DECISIONS.md), LIVE-082).** This section called it exactly right, and
it is what actually happened: the Community tab was deleted in C3.4, nothing took its place, and the
`#circles` anchor the C3.1 amendment substituted was a scroll target on Home rather than a page. The
real tab exists now, gated hide-at-zero for visitors and always-on for a manager. The URL collision
the C3.1 amendment worried about was resolved the other way round: the **owner console** moved.

### 4.4 🔴 The one capability with no replacement

"Post once, reach everyone following this Space" has no Circle equivalent, and cannot have one by
construction: a Circle post is `visibility='group'` scoped to `circles.id`, so it reaches that
Circle's roster and nobody else. A Space with 7 followers and 3 Circles cannot address all 7 with a
Circle post.

Two honest answers, and this is a **product** call the owner must make, not an implementation detail:

| Answer | What it means |
| :-- | :-- |
| **Drop it.** | Broadcast reach was never used (0 posts). The remaining paths — the `SpaceUpdates` brand block, Dispatch, and the Message center (`space.messages`, already in `SPACE_MODULES:172`) — cover "tell my people something." A Space's *conversation* moves into its Circles. |
| **Keep it.** | Then it is a new build, not a migration: a Space-scoped announcement surface, distinct from a Circle. That reintroduces the third container ADR-1013 §Context named as the whole problem. |

**Recommendation: drop it,** and say so in the ADR, because it is the direct consequence of ADR-1013's
own reasoning: *"'where does X live?' must have one answer, and by 2026-08 it had three."*

---

## 5 · Migration path for existing data

### 5.1 What the record actually says

The brief asked me to find and quote an owner ruling to "archive communities" rather than re-decide
it. **I searched `docs/DECISIONS.md` and every `docs/*.md`, and no such ruling exists.** What exists
is two things, and they are about different objects:

> **[ADR-1013](DECISIONS.md) §3 — Space Communities:** "**Space Communities is removed.** A Space's
> community is its **Circles**."

That ruling says *removed*, and specifies no disposition for the rows. The ADR is explicit that it
left one such question open, and it left the **Channel room's** rows, not the Community's:

> **[ADR-1013](DECISIONS.md) §Consequences:** "**The Channel room's data has an owner question.**
> Retiring the surface is a product ruling; what happens to whatever room rows exist behind it is a
> migration question this ADR does not answer. It is deliberately left open rather than guessed at."

The archive rule the brief is probably remembering is [ADR-879](DECISIONS.md), and it governs
**Channels** (`topical_channels`), not Communities:

> **[ADR-879](DECISIONS.md):** "**Archive is the only destructive verb. There is no hard delete, and
> that is deliberate.** … A hard delete is refused because **`circles.topical_channel_id` points here
> and carries no cascade guarantee we want to exercise**."

⚠️ **That rationale does not transfer.** It rests on an inbound FK from `circles`. Nothing points at
`space_updates` except its own anchor post, and one release later [ADR-882](DECISIONS.md) gave
Channels a real transactional delete anyway. So the archive precedent is narrower than it looks and
its own author walked it back.

**This plan therefore does not claim an archive ruling exists. It recommends, and asks the owner to
rule.**

### 5.2 Recommendation

| Object | Disposition | Why |
| :-- | :-- | :-- |
| **Community feed code** (route, 2 components, 7 actions, 2 readers) | ✅ **delete** | 0 rows, 0 users, 0 help articles. Dead code that carries a live RLS grant (§2.3) is a liability, not an asset. |
| **`space_updates` table** | ✅ **keep, untouched** | It also backs the `SpaceUpdates` brand block (§2.2), a separately-decided feature. Dropping it would remove something nobody asked to remove. |
| **`posts(post_type='space_update')` rows** | ✅ **nothing to do — there are none** | |
| **The `is_space_update_post` RLS arms** (5 policies) | ⚠️ **narrow in a later pass, not in C3** | They still serve nothing once the wall is gone, but they touch `posts` and `post_reactions`, the busiest tables in the app. Removing an arm from a permissive policy is a **narrowing**, so it is safe in direction but wide in blast radius. It deserves its own migration with its own pgTAP proof, after C3 lands. |
| **Existing Communities → Circles** | ✅ **no conversion, because there are none** | |

The three options the brief named — convert / archive / read-only — are all answers to "what happens
to the members' content," and **there is no members' content**. Converting zero rows is
indistinguishable from archiving zero rows. The only live question is what happens to the *code and
the grants*, and the answer is delete the code now, narrow the grants next.

⚠️ **If the owner's intent is "never hard-delete a member-facing surface, on principle,"** then the
reversible version is: delete the route and the tab (nobody can reach it), keep the actions and the
readers behind no caller for one release, and remove them in the following one. That costs one extra
release and buys back a `git revert`. Given 0 rows, this plan does not recommend paying it — but it
is a one-word change if the owner prefers it.

---

## 6 · Order of operations

Nothing below is ever broken mid-flight. Each step is independently shippable and each states its
predecessor.

| # | Ships | Depends on | Reversible? | Breaks a URL? |
| :-- | :-- | :-- | :-- | :-- |
| **C3.0** | ⚠️ **Fix the `space_members` copy or widen the predicate** (§4.2, option A or B). Standalone; own ADR; own pgTAP if B. | — | ✅ yes | no |
| **C3.1** | ✅ **Circles takes the name.** ⚠️ *Amended 2026-08-20 (ADR-1091): the "public Circles tab" is the `#circles` SECTION ANCHOR, not a new route — `/spaces/<slug>/circles` is already the owner-only manager (`space.circles` deep-links to it), so a `(profile)/circles` page would collide on the same URL.* 🔴 **That amendment was reversed 2026-08-21 ([ADR-1094](DECISIONS.md)): an anchor is not a tab, and the collision was resolved by moving the CONSOLE to `/manage/circles`, not by settling for a scroll target. The anchor is now suppressed via `DEDICATED_TAB_ANCHORS` so it does not sit in the menu beside the real tab.* Rename the section anchor `community` → `circles` with label `Circles`, the presence flag with it (it already gates on ≥1 live Circle), **relabel the `SpaceCommunity` block to `Circles`** — 🔴 **type key unchanged**, see §7.1 — swap the template eyebrow `'Community'` → `'Join in'` plus a ledgered props-only rewrite of the 18 seeded layouts, and fold the ADR-1013 amendments into `NAMING.md`. | — | ✅ yes | no |
| **C3.2** | ⚠️ **Repoint the notification destination.** `lib/notifications/href.ts:62` stops emitting `/spaces/<id>/community` and emits `/spaces/<id>` instead. | — | ✅ yes | no |
| **C3.3** | ⚠️ **Add the 308.** `/spaces/<slug>/community` → `/spaces/<slug>` in `next.config.ts`. **Ships before C3.4, never with it**, so no window exists where the URL 404s. | C3.1 | ✅ yes | ✅ **fixes** one |
| **C3.4** | 🔴 **Delete the feature.** Route, `components/spaces/community/space-community-{feed,rail}.tsx`, the 7 actions, `getSpaceCommunityFeed` + `getSpaceMemberPosts`, the tab row, `revalidatePath`, `DEDICATED_TAB_ANCHORS`'s `'community'` entry, and the 8 test files in §3.4. | C3.2, C3.3 | ⚠️ `git revert` only | the 308 covers it |
| **C3.5** | ⏳ **Narrow the RLS.** Drop the `is_space_update_post` arms from the 5 policies in §2.3; drop the helper. Own migration, own pgTAP, own ledger insert. | C3.4 | 🔴 **irreversible in practice** (recreating a permissive arm by hand is how grants drift) | no |

**Irreversible steps: C3.4 and C3.5 only.** Everything before them is a config or a label.

**Bookmarks.** `/spaces/<slug>/community` resolves for all 20 Spaces today. It is linked from exactly
one place in the product (the notification href) and from nothing external — it carries its own
canonical (`page.tsx:27-34`) but is not in `app/sitemap.ts`, so crawler exposure is limited to
whatever has been organically linked. The C3.3 → C3.4 ordering means the URL is never dead: it
redirects the moment it stops rendering.

**Do not reorder C3.3 and C3.4.** That is the whole point of splitting them.

---

## 7 · The risks

### 7.1 🔴 Renaming the `SpaceCommunity` block silently deletes a section from 18 live pages

`SpaceCommunity` is a **block type key stored in `spaces.preferences` as jsonb**. Production:

```
spaces with 'SpaceCommunity' in their saved layout:  18 of 20
spaces with 'SpaceUpdates'   in their saved layout:   0 of 20
```

And the renderer, per [ADR-978](DECISIONS.md), **skips an unknown block type rather than throwing**
(`lib/page-editor/block-render.tsx:6`, `lib/page-editor/unknown-blocks.test.tsx`). That is a good
fail-safe and it is exactly what makes this dangerous: rename the key to `SpaceCircles` and 18 Spaces
lose their Circles section **with no error, no log, and no gate that notices**. This is the precise
failure mode `AGENTS.md` names — *"Every fail-safe needs a gate that notices it fired. A swallowed
error is an invisible regression."*

⚠️ *Update 2026-08-20: the gate now exists.* `pnpm check:stored-blocks`
(`scripts/check-stored-blocks.mjs` + `scripts/stored-block-types.json`, which records
`SpaceCommunity` in 18 stored layouts) fails CI on any stored type key the registry retired. The
mitigation below still stands — the key is never renamed — and the gate is what notices if anyone
tries anyway.

**Mitigation, in order of preference:**
1. ✅ **Do not rename the key.** Change `label` (`'Circles (live)'` → `'Circles'`), the anchor
   (`community` → `circles`), and the default `eyebrow` (`'Community'` → drop it). The key is an
   internal identifier no member ever sees. **This plan recommends this.**
2. ⚠️ If the key must change: a jsonb rewrite migration over all 20 Spaces **plus** a permanent alias
   in the renderer **plus** a test asserting 0 rows still contain the old key.

### 7.2 ⚠️ Any Community-shaped successor would widen access, not narrow it

The `is_space_update_post` carve-out (§2.3) grants **every signed-in profile** read on **every**
`space_update` post platform-wide, with no Space term. A Circle's `visibility='group'` posts are
gated on `scope_id = any(private.get_my_circle_ids())`. Moving in the direction of the Circle is a
**narrowing** and is safe. The danger is the reverse: if anyone later builds a "Space wall" by reusing
the `space_update` post type, they inherit a platform-wide read grant by accident. **C3.5 exists to
remove that footgun**, and the ADR should say so in those words.

### 7.3 ⚠️ Deleting `space_updates` would take out the brand blog

Covered in §2.2 and §5.2. Named here because "Space Communities is removed" reads, to a fast reader,
like "drop `space_updates`." It must not.

### 7.4 ⚠️ Losing the Community tab loses the rail with it

`SpaceCommunityRail` (`space-community-rail.tsx:34-52`) is the only surface composing About +
contact + hours + booking CTA + upcoming events + practices + circles in one column. Deleting the
route deletes it. Every input is a Space profile block that already exists elsewhere, so **nothing is
lost that cannot be re-composed** — but if the owner liked that rail, C3.1 is where it gets rebuilt,
and it must be said out loud rather than discovered after the delete.

### 7.5 ⚠️ Who stops seeing what

| Viewer | Sees today | Sees after | Net |
| :-- | :-- | :-- | :-- |
| Anonymous visitor | The Community tab (empty on all 20 Spaces) | Nothing there; a Circles tab if the Space runs listed Circles | ✅ strictly better — an empty tab replaced by a real one or none |
| Follower | Same, plus a composer they never used | Circles they may join | ✅ better |
| Space operator | An empty wall + an unused toggle | Circles manager (already exists) | ✅ neutral |
| Space **team member** (`space_members`) | — | ⚠️ **gains** entry to any `space_members` Circle. 0 circles are closed today, so **the live impact is nil**, but §4.2 option B would change that population. | ⚠️ watch |
| Paying member (`space_memberships`) | The wall | 🔴 **no Circle mode admits them** until §4.2 lands | 🔴 the gap |

### 7.6 ✅ Risks that are not risks here

- **No member content is lost** — there is none (§2.1). This is the single most important sentence
  in the plan and it was established by query, not assumption.
- **No admin menu drift** — no `SPACE_MODULES` row exists, so `pnpm check:menu` cannot fire (§3.3).
- **No help-center gap** — nothing documented it (§3.3).
- **No Studio manifest** — Communities has no `lib/studio/entities/*` manifest, so `pnpm check:studio`
  is untouched.
- **No build-budget effect** — this removes 4 files from the route tree and adds none.

---

## 8 · Naming (docs/NAMING.md)

⚠️ **"Community" is a canon term for four other things**, which is a second, independent reason to
stop using it for a Space feature:

| Canon use | Where |
| :-- | :-- |
| **Community structure** = the Circle → Hub → Nexus tree | `NAMING.md:217` |
| **`community_role`** = the member ladder, member…mentor | `NAMING.md:248` |
| **Community Resonance** = a Space's **CRM tab** (its members + followers) | `NAMING.md:285` |
| **Community Collective** = the platform's own brand descriptor | `NAMING.md:452-455` |

`NAMING.md:269-271` already records the same collision being resolved once before: the sidebar row
labeled "Community" was renamed **Members** in ADR-868 precisely because *"it collided with the
section header above it and with the brand's 'The Community'."* A Space tab labeled "Community" is
that same mistake in a different place.

**Canon edits this plan creates:**
- `NAMING.md` §Community structure — fold in ADR-1013's amendment (a Circle is the container, local
  **or online**; a Channel is the topic axis). ADR-1013 §Consequences already books this as due.
- `NAMING.md` — add a line: **"Community" is never the name of a Space-level surface.** A Space's
  community is its **Circles**.
- `lib/circles/visibility.ts:66,76` — the `space_members` label and hint, per §4.2.
- `docs/COMMS-STRATEGY.md` — the six-surface table and the Channel room, also booked by ADR-1013.

---

## 9 · What the owner is being asked to approve

── DECIDED 2026-08-19/20. The owner approved the removal (OWN-015: *"Remove Communities, replace
with circles."*) and [ADR-1091](DECISIONS.md) ratified this plan's recommendations on questions
1, 2, 3, 5 and 6 exactly as written below. **Question 4 remains the one open owner call** — it is
now [OWN-034](BUILD-BACKLOG.json), it gates nothing in C3.1–C3.5 (all 7 Space Circles are
`access='open'` today), and option B, if chosen, ships as its own change with its own pgTAP proof.

| # | Decision | This plan's recommendation | Ruling |
| :-- | :-- | :-- | :-- |
| 1 | Hard-delete the Community feed code, given 0 live rows? | ✅ **yes** (§5.2). The reversible alternative is one word and costs one release. | ✅ approved (ADR-1091) |
| 2 | Keep `space_updates` alive for the brand Updates block? | ✅ **yes** (§2.2). | ✅ approved (ADR-1091) |
| 3 | Is losing "post once, reach every follower" acceptable? | ✅ **yes, drop it** (§4.4). Dispatch and the Message center cover the need; rebuilding it recreates the third container ADR-1013 retired. | ✅ approved (ADR-1091) |
| 4 | Fix `access='space_members'` — relabel (A), widen (B), or add a mode (C)? | **B**, shipped separately with its own proof (§4.2). | ✅ **ruled C** (OWN-034, 2026-08-20, [ADR-1092](DECISIONS.md)): `space_members` keeps the staff ladder with honest copy ("Space team only"), and a sixth mode `space_paid_members` admits active paid members. See the §4.2 premise correction. |
| 5 | Rename the `SpaceCommunity` **block type key**? | 🔴 **no** — label and anchor only (§7.1). | ✅ approved (ADR-1091) |
| 6 | Narrow the `is_space_update_post` RLS arms? | ✅ **yes, in C3.5**, its own migration, after the delete (§5.2, §7.2). | ✅ approved (ADR-1091) |

---

*Prepared as a read-only scope. No feature code written, no migration run, no production data
modified. Every count in §2.1 came from a `SELECT` against `azsqfeonabsbmemvddqd` on 2026-08-12.*
