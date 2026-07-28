# The member profile: header, layout, associations, and chat

> **The answer.** The header is not primarily a colour problem. It is a collision problem: the name and the buttons are laid out in one row that lets them land on top of each other, and no contrast algorithm can rescue overlapping text. Fix the layout first (day one, two commits, no maths), take four controls off the photograph, and only then correct the two real measurement bugs in the contrast system that already ships. Alongside that: move `Block` and `Act as` to the join-date line as asked; make `Reconnect` open the chat dock and retire the direct-message pages behind a flag this sprint (the room pages need a real port first, and this plan says so plainly instead of deferring the whole ask); and add an associations panel that shows what a member has built, what they are in together with you, and, on your own profile, everything you are part of. The page also gets a floor so a brand-new member's profile is never a void.

| | |
| --- | --- |
| **Owner asks answered** | 3 of 3, one of them (chat) split into a part that ships now and a part that is honestly blocked |
| **Recommended additions** | 17, ranked; a one-day cut line at step 7 |
| **Build steps** | 34, one commit each, in dependency order |
| **Adversarial defects folded in** | 36 of 36 applied, 0 overruled |
| **Blast radius** | 1 page, 1 shared template, 1 shared CSS block, 3 messaging call sites |
| **Date** | 2026-07-28 |
| **Branch** | `claude/repeating-events-display-lyv7b5` |

---

## 1. The header problem, diagnosed

### In plain language

Three separate things are wrong with the header, and they are not equally to blame.

**First, and by far the largest: the name and the buttons are allowed to sit on top of each other.** `PageHero`'s identity variant puts the name lockup and the action cluster in a single flexible row that wraps (`components/templates/page-hero.tsx:173`). The profile then hands that row a *nested two-row column* of buttons (`app/(main)/people/[handle]/page.tsx:331`) that is marked "never shrink", plus a QR chip as a loose sibling. When the row wraps, the whole button cluster drops onto the `@handle` line. That is what the screenshot shows: `Settings` over the tail of the name, `Block` and `Act as` over `@ishasetlumi`. It is a layout defect. It would look exactly this bad in pure black on pure white.

**Second: the buttons never participate in the colour system at all.** The adaptive token `--color-on-media` is read at exactly two places in the whole codebase, the heading and the subtitle (`page-hero.tsx:132-133`). `HERO_ACTION_CLASS` is hardcoded cream-on-glass (`page-hero.tsx:88`), and `FriendButton`, `TipButton` and the staff `Settings` trigger use *page-canvas* colours that were never designed to sit on a photograph. So even when the system works perfectly, the name can flip to near-black while every button stays cream on the same photo.

**Third: the measurement asks the wrong question.** The sensor takes one arithmetic mean of one fixed bottom-left band (`lib/images/hero-contrast.ts:31,178-192`). A bright white coat next to dark timber averages to a mid-tone that scores as "passing" while the copy is invisible over the coat. Roughly 73% of that band is not behind any text, and none of it covers the buttons.

### Ranked root causes

| # | Root cause | Explains the screenshot? | Evidence (verified in tree) | Fixed by step |
|---|---|---|---|---|
| 1 | **Layout collision.** One `flex flex-wrap items-end justify-between gap-x-4` row; identity `min-w-0`, actions `shrink-0`; profile nests a two-row column inside the actions slot | 🔴 **Yes, primary** | `page-hero.tsx:173-192`; `page.tsx:330-386,438-443` | 3, 4, 5 |
| 2 | **Wrong statistic.** One mean over one fixed band; a bimodal cover reads mid-tone and "passes" | 🔴 **Yes, secondary** | `lib/images/hero-contrast.ts:31,168,178-192` | 8, 9 |
| 3 | **Tone has no reach.** `--color-on-media` consumed at 2 sites; every chip hardcodes its colour; three chips use page-canvas tokens on a photo | ⚠️ Makes any fix look half-done | `page-hero.tsx:88,132-133`; `friend-button.tsx:47`; `tip-button.tsx:41`; `profile-settings-drawer.tsx:68` | 6, 10 |
| 4 | **Sampling failure is a latent wrong answer**, not the cause of this screenshot | ❌ **No** | `hero-adaptive-text.tsx:81-93` | 9 |
| 5 | **Whole-hero scrim is weakest where the text is.** `linear-gradient` reaching only ~23-31% at the name's y position | ⚠️ | `app/globals.css:1431-1450` | 9 |
| 6 | **First paint is always light copy.** Server has no measurement; the sensor corrects after hydration | ⚠️ Flash only | `app/globals.css:55-57`; `page-hero.tsx:132` | 30 (later) |

**Correcting the earlier diagnosis on cause 4.** An earlier draft called the fallback branch "the exact screenshot". It is not, and the file says so. `components/templates/hero-adaptive-text.tsx:91-93` sets **both** `dataset.mediaTone = 'dark'` **and** `dataset.mediaScrim = 'on'`, and `data-media-scrim="on"` raises `.hero-text-scrim` to full opacity (`app/globals.css:1444-1446`) — a visible ink gradient. The screenshot shows white copy on mid-tone wood with **no scrim**. That means sampling *succeeded* and the mean statistic returned a false pass. The fallback is still a real bug worth deleting, but it is not what the owner photographed. Getting this ranking right matters: ship the layout and the statistic first, or the symptom persists and the team concludes the approach failed.

**Honest verdict on "contrast maths vs layout":** the layout collision is the primary defect and is 100% of the overlap in the screenshot. The mean statistic is the primary defect in the *legibility* of the name where it does not overlap. Both are real. The layout is cheaper, safer, and needs no maths, so it ships first.

### Before and after

| | Today | After |
|---|---|---|
| **Geometry** | One wrapping row. At most widths the button cluster lands on the `@handle` line. QR chip floats as a third sibling. Six controls plus a nested column ride the photo. | Two lanes that cannot share a line: identity left, actions right at wide widths; stacked, right-aligned, below. Cover carries at most three chips. |
| **What rides the photo** | Friends, Save contact, Message, Tip, Settings, QR, Block, `Act as` | Friends, Message, QR |
| **Where the rest goes** | — | On the band beside `Joined July 2026`: `Block`, `Act as`, `Save contact`, `Tip`, `Settings` |
| **Text colour** | One tone for the whole hero, from a mean over a fixed band. Buttons ignore it. | Per zone. The lockup resolves from the pixels under the lockup; the action row from the pixels under the action row. Every chip reads the same token as the name beside it. |
| **Hard photos** | A whole-hero gradient that is weakest exactly where the name is | The shipped ink halo first; a local plate behind one zone only when the halo is not enough |
| **Unmeasurable cover** | Silently locks to light copy forever | Falls back to today's known-acceptable halo, plus one Sentry warning with a reason code |
| **Landmark / a11y** | Unnamed `<section>`, unlabelled pile of buttons, avatar `alt` duplicates the `h1` | Named landmark, labelled action group, decorative avatar |

---

## 2. At a glance

### The three owner asks

| # | Ask (verbatim) | Answer | Size | Ships |
|---|---|---|---|---|
| 1 | "Move the Block and Act as links under the header image, on the same line as the join date." | ✅ Exactly that. They go trailing-right on the `Joined {month year}` row, the slot `Edit profile` already occupies for the owner. Mutually exclusive by construction, so one geometry serves both views. | S | Step 3, day 1 |
| 2 | "When I hit the Reconnect with button it took me to a chat page. That page should not exist. All chats happen in the pop up on the lower right." | ✅ for the button and ✅ for **direct-message pages**. `Reconnect` and `Message` open the dock in place (step 26). `app/(main)/messages/[id]` retires behind a flag in the same sprint (step 28) because the dock renders the identical `MessageThread` at full parity. ⚠️ **Room** pages cannot: every room-administration verb in the product exists only there. That is named, listed, and dated, not deferred silently. | M + L | Steps 24-28 now; rooms gated |
| 3 | "On a profile page, show all associations for Spaces, Circles, Events, Journeys etc. A profile stats box of everything they have created or are associated with." | ✅ In three tiers, because "associated with" and "privacy" collide and only the owner can rule on that: **(a) built** (public, viewer-independent), **(b) in common with you** (Circles you are both in, which RLS explicitly permits), **(c) your own full picture** on your own profile behind an "only you can see this" marker. The one association the page shows today is replaced, not deleted. | L | Steps 19-23 |

### Recommended additions, blast radius, kill switches

| Recommendation | Why | Kill switch |
|---|---|---|
| Cover diet: `Tip`, `Save contact`, staff `Settings` off the photo | `TipButton` opens a `max-w-sm` card **on top of the cover**. Three of six chips use page-canvas colours on a photograph. | Revert one commit |
| Per-zone tone + worst-tile statistic | The mean is provably wrong on a mixed photo | `adaptiveText={false}` at `page.tsx:433`, one prop |
| One on-cover chrome (`HERO_ACTION_CLASS_ADAPTIVE`) | Five button treatments on one photo become one | Revert 4 call sites; the constant can stay unused |
| Body order: person before gamification | Below 1280px the page renders Standing, Achievements and Awards **before** the bio and timeline | 4 utility classes |
| Five sidebar boxes → three `SidebarCard`s | Four fake `<p class="font-bold">` headings mean a screen-reader user gets nothing from the whole right column | Revert one commit |
| Empty states become invitations or `null` | Four dead boxes in one viewport | Revert one commit |
| **The new-member floor** | After every other change, a stranger viewing a 3-day-old member would see a *shorter* page than today. This adds one region that always has substance. | Revert one commit |
| Associations panel | The answer to "why is this page here" | `platform_flags` row, no deploy |
| Chat dock open-at-thread | Members stop losing their scroll position | Revert one PR |
| DM route retirement | The owner's literal instruction | `platform_flags` row, no deploy |

**Blast radius.** One page (`app/(main)/people/[handle]/page.tsx`), one shared template (`components/templates/page-hero.tsx`, whose `identity` variant is also used by Journeys), one shared CSS block (`app/globals.css`, the `.hero-adaptive-text` block at 1415-1450), three messaging call sites, and one new library module. `adaptiveText` is passed at exactly **one** call site today (`page.tsx:433`), so every new contrast hook gated on it cannot regress any other hero.

---

## 3. The owner's three changes

### 3.1 Edit 1 — `Block` and `Act as` move under the header image

**Exact answer.** They render on the same line as `Joined {month year}`, trailing right, inside the band's existing `justify-between` row at `page.tsx:451-469`. That right half is occupied by `editProfileButton` for the owner and is free for every non-owner; `Block` / `Act as` are `!isOwner`-only. Mutually exclusive by construction.

**Scope verdict: 🟢 small.** One file, four edits, plus one class on `BlockButton`. No new layout vocabulary.

**Code-level plan** (`app/(main)/people/[handle]/page.tsx`):

1. **Delete `hasSecondary`** (`:329`). It is dead logic: `isJanitorViewer` is defined at `:218` as `!isOwner && realWebRole === 'janitor'`, so `(!isOwner) || isJanitorViewer` is exactly `!isOwner`. Leaving it fails `pnpm lint` on an unused const.
2. **Flatten `viewerActions`** (`:330-386`) from a two-`div` column to a fragment. The nested column is what makes the cluster rigid and two rows tall.
3. **Add `secondaryActions`** immediately after:

```tsx
  // Block · janitor "Act as" — the quiet, lower-stakes viewer controls. They read BELOW the
  // cover, trailing the joined/stats line, so nothing competes with the name lockup on the
  // photo AND both finally use PAGE tokens on a page surface (they were page-token text
  // sitting on a photograph). `ml-auto` keeps them right-aligned even at the narrow widths
  // where the stats row wraps them onto their own line.
  const secondaryActions = user && !isOwner ? (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <BlockButton profileId={profileId} blocked={isBlocked} variant="link" />
      {isJanitorViewer && (
        <form action={actAsMember.bind(null, profileId)} className="border-l border-border pl-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-xs font-medium text-signal-strong transition-colors hover:underline"
            aria-label={`Act as ${firstName}. Full control of this member's account.`}
            title="Act as this member (full control)"
          >
            <UserCog className="h-3 w-3" />
            Act as {firstName}
          </button>
        </form>
      )}
    </div>
  ) : null
```

4. **Swap `page.tsx:468`** to `{editProfileButton ?? secondaryActions}`. The nullish form documents the mutual exclusion.
5. **`block-button.tsx:33`** — its error wrapper is `inline-flex flex-col`. On the cover it grew upward; on the band it will push the bio down. Add `items-start` in the same commit.

**Decisions taken here**

| Question | Decision | Why |
|---|---|---|
| Which end of the line? | Trailing, right-aligned | The slot `Edit profile` already occupies, so owner and visitor keep identical geometry. Leading would put a destructive control before the member's own facts. |
| Right-alignment mechanism | `ml-auto` on the wrapper | A lone item that wraps onto its own line in a `justify-between` row lands at flex-start without it |
| Gating | `user && !isOwner`; `Act as` additionally `isJanitorViewer` | Signed-out renders null, unchanged |
| Blocked state | `Block` / `Unblock` still renders when `isBlocked` | Unchanged behaviour |
| `Act as` weight | `text-xs font-medium text-signal-strong` link, last, behind a `border-l border-border pl-3` hairline | Operator tool: must not read as a member action, must stay findable |
| Copy | `Block` · `Confirm block` · `Cancel` · `Unblock` · `Act as {firstName}` — all unchanged | Already voice-clean |

**What this buys for free.** Both controls paint with `text-subtle` / `text-signal-strong` today, which are *page-canvas* tokens sitting on a photograph. They never read `--color-on-media` and never could. Moving them makes their colours correct by construction. This is the cheapest partial answer to the contrast complaint, and it needs no contrast work at all.

---

### 3.2 Edit 2 — the chat page

> **Owner, verbatim:** *"When I hit the Reconnect with button it took me to a chat page. That page should not exist. All chats happen in the pop up on the lower right."*

**Scope verdict: this is one small fix and one real port, and the plan says which is which rather than deferring both.**

| Reading | Honest size | Verdict |
|---|---|---|
| "Reconnect should open the dock, not navigate" | 4 files, ~180 lines, no migration | ✅ Ships now (steps 24-27) |
| "The DM page should not exist" | Gate a flag on one file; the dock renders the identical `MessageThread` component | ✅ **Ships this sprint** (step 28) |
| "The room page should not exist" | Every room-administration verb lives only there | 🔴 **Blocked on a port.** Named, listed, and put to the owner with a date |

#### Why the DM page can go now and the room page cannot

| Verb | Only entry point today | Dock equivalent |
|---|---|---|
| Read / post / realtime / typing (DM) | `MessageThread` | ✅ **full parity, same component** |
| In-room semantic search | `messages/r/[roomId]/page.tsx:183` | 🔴 none |
| Rename / description / visibility / delete a room | `r/[roomId]/page.tsx:185` | 🔴 none |
| Join / leave a room | `r/[roomId]/page.tsx:188-206` | 🔴 none |
| Invite to room | `r/[roomId]/page.tsx:252` | 🔴 none |
| Promote / demote / remove member | `r/[roomId]/page.tsx:222-244` | 🔴 none |
| Non-member join preview | `r/[roomId]/page.tsx:228-244` | 🔴 none |
| Create a room | `NewRoomCompose` on `/messages` | 🔴 none (the dock's `Rooms` button 404s today) |
| Conversation list beyond 5 + 5 | `/messages` | ⚠️ dock caps at 5 + 5 (`popover-actions.ts:85,165`) |

**Two independently flippable gates**, so the owner's instruction is honoured as far as it can be honoured:

| Gate | Flag | Covers | Blocked on | When |
|---|---|---|---|---|
| **A** | `chat_dm_routes_retired` | `app/(main)/messages/[id]/page.tsx` → `redirect('/feed?chat=dm&thread=<id>')` | Nothing. Ships with step 28. | This sprint |
| **B** | `chat_room_routes_retired` | `app/(main)/messages/page.tsx`, `app/(main)/messages/r/[roomId]/page.tsx` | The 8-item room-admin port (P2-1..P2-8) | **Needs an owner decision and a date.** See open question O1 |

**Deep-link blast radius: near zero, and verified.** No email, push, digest or cron builds a `/messages` URL (`lib/notifications/registry.ts` has no message event). `/messages` is `Disallow`ed in `app/robots.ts:30` and absent from `app/sitemap.ts`. One surface does break: `public/.well-known/apple-app-site-association:13` registers `/messages/*` as an iOS universal-link path. A render-time redirect (not a delete) keeps that working.

**Why a flag and not a `next.config.ts` redirect.** Config redirects are evaluated before routing (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md`), so they cannot read a database row and are not revertible without a deploy. They also shadow live routes with no build error — the exact bug that killed three of five `/pricing` persona doors and forced `lib/marketing/funnel-redirects.test.ts` into existence. Phase-4 hard deletes may use them; the retirement gate must not.

**Naming.** The surface is **the chat dock** everywhere: the code (`components/messages/dock-chat.tsx`), the plan doc (`docs/CHAT-SHELL-PLAN.md`), and the operator toggle. The owner said "pop up" conversationally; that is not a reason to ship a second name. Operator toggle label: `Chat in the dock only`. Helper: `When this is on, the full message pages send members to the chat dock instead.` Add the row to `docs/NAMING.md` in the same PR, and reconcile the left-rail label `Message Boards` (`lib/nav/registry.ts:305`) with it, because a member cannot map "Message Boards" onto "the dock" unaided.

---

### 3.3 Edit 3 — associations

> **Owner, verbatim:** *"show all associations for Spaces, Circles, Events, Journeys etc. A profile stats box of everything they have created **or are associated with**."*

**Scope verdict: 🟠 the ask as written cannot be shipped in full without a product decision, so it ships in three tiers and the decision goes to the owner rather than being taken inside a spec.**

The problem: **every "member of" relation on this platform is owner-private or service-role-only by RLS.** `memberships`, `event_rsvps`, `space_members`, `topical_channel_memberships`, `journey_completions` are all "read own" or on `scripts/rls-deny-all.txt`. And the page reads through `createAdminClient()` (`page.tsx:71`), which **bypasses RLS entirely**, so app-code filters are the *only* enforcement. A count leaks as surely as a list. But answering "created-by only" and calling it done narrows the owner's own words, and the first commit of the earlier draft *deleted* the one association the page shows today, so a member in three Circles who has built nothing would go from one association to zero.

**Three tiers:**

| Tier | What it shows | Who sees it | Safety basis |
|---|---|---|---|
| **A. Built** | Circles hosted · Spaces owned · Events hosted · Journeys published · Practices published · Classifieds listings | Everyone, identically | Viewer-independent, explicit allowlist filters, count computed from the same filtered set as the list |
| **B. In common with you** | `Circles you are both in` | Signed-in non-owner only | `memberships` is readable by the member, their **co-members**, and the host. The viewer already knows their own Circles; the intersection reveals nothing new to them. |
| **C. Your own picture** | Everything you are part of: Circles, Channels, Space seats, enrolled Journeys | **Owner only**, behind the existing "only you can see this" pattern (`PrivateContactPanel`, `page.tsx:484`) | Own rows. Zero risk. This is what honours "everything they are associated with" for the person who asked. |

Tier B replaces the deleted `{n} circles` line with something safe, rather than with nothing.

**The governing rule, stated once:** *a count is computed from exactly the same filtered row set as the list it heads. If a row is not listable to this viewer, it is not countable either.*

**The live leak that closes in step 3.** `page.tsx:457-464` renders `{n} circles` from a `memberships` read with **no `unlisted` filter and no status filter** (`page.tsx:191`), and deep-links a lone circle. An unrelated member can learn that someone belongs to one unlisted Circle and click straight into it. That line goes in the same commit as Edit 1, so the fix does not wait on the associations PR. **And the `circlesResult` read that stays behind to power the `Circle Up` achievement must be filtered the same way** — an earned `Circle Up` chip on a stranger's profile publishes exactly the bit the deletion protects, three DOM nodes away.

---

## 4. Recommended additions, ranked

Effort: **S** under half a day · **M** 1-2 days · **L** 3+ days.

### Do now

| # | Recommendation | What a member gains | Effort | Impact | Step |
|---|---|---|---|---|---|
| R1 | Quiet actions leave the cover (owner ask 1) | The single defect in the screenshot | S | 🔴 high | 3 |
| R2 | Two lanes in the hero that cannot overlap | The collision cannot come back next time someone adds a button | S | 🔴 high | 4 |
| R3 | Cover diet: `Tip`, `Save contact`, staff `Settings` off the photo | `TipButton` stops opening a card on top of the photograph; three chips fewer to make legible | S | 🔴 high | 6 |
| R4 | Body order: person before gamification | Below 1280px the reader currently gets Standing, Achievements and Awards *before* the bio and timeline | S | 🔴 high | 7 |
| R5 | Worst-tile statistic, per-zone tone | The measurement finally asks "is any part of this word hard to read" | M | 🔴 high | 8, 9 |
| R6 | Fail toward the shipped halo, never toward a tone guess | An unmeasurable cover gets today's known-acceptable treatment instead of the reported bug | S | 🔴 high | 9 |
| R7 | One on-cover chrome (`HERO_ACTION_CLASS_ADAPTIVE` + `onMedia` on `FriendButton`) | Five button treatments become one family, all tone-aware | M | 🔴 high | 10 |
| R8 | `SidebarCard` for the right column; Achievements folded into Standing | Four fake headings become real `<h3>`s; five near-empty boxes become three with content | S | 🔴 high | 14 |
| R9 | **The new-member floor** | A stranger viewing a 3-day-old member gets a page with substance instead of a shorter void | S | 🔴 high | 17 |
| R10 | Associations panel (owner ask 3) | An answer to "why is this page here" | L | 🔴 high | 19-22 |
| R11 | `Reconnect` / `Message` open the dock (owner ask 2) | The member keeps their scroll position | M | 🔴 high | 24-26 |
| R12 | DM routes retire behind a flag | The owner's literal instruction, for the half that is actually ready | S | ⚠️ med | 28 |
| R13 | Empty states become `EmptyState` with a real action, or `null` | Four dead boxes in one viewport | S | ⚠️ med | 15 |
| R14 | Telemetry on the sensor fallback | The failure is silent, permanent and indistinguishable from success today. That is why a shipped bug survived to a screenshot. | S | ⚠️ med | 11 |
| R15 | `RoleBadge` compact size | Kills four `!important` overrides on a shared badge (`page.tsx:282-287`) | S | ⚠️ med | 13 |
| R16 | Name the hero landmark, fix the avatar `alt` | A screen reader stops announcing "Ishaset Lumi, image, heading level 1 Ishaset Lumi" | S | ⚠️ med | 13 |
| R17 | Perceived performance: parallel waves, per-section Suspense, sized skeletons | The hero paints without waiting on a 100-row `my_orbit` RPC | M | ⚠️ med | 18 |

### If you only have one day

**Do steps 1, 3, 4, 5, 6, 7.** That is: ground the tree, move `Block` and `Act as` off the cover, give the hero two lanes, flatten and label the profile's actions, put `Tip` / `Save contact` / `Settings` on the band, and flip the body order.

That is **100% of the collision** in the screenshot and it needs **no contrast work at all**.

🔴 **Do not include the per-zone CSS (step 9's first half) in a one-day cut.** The new CSS reads `data-media-tone` on `.hero-zone`; the live sensor writes it on the `<section>` (`hero-adaptive-text.tsx:103`). Shipped alone, every profile would fall into the unmeasured branch permanently. **Steps 8 and 9 are one atomic change** — the CSS and the sensor ship together or not at all, and a drift guard enforces the pairing.

### Do later (own PR)

| # | Item | Why later |
|---|---|---|
| L1 | Server-seeded first-paint tone on `profiles.meta.headerTone` | Touches a save path and adds a write. Do it once the owner has approved how the fixed header looks. |
| L2 | Extend `check:tokens` to raw Tailwind palette (`border-white/40`, `bg-black/30`) | Fails existing files repo-wide until a sweep lands; it is its own PR or it becomes a red gate on unrelated work |
| L3 | Opt Journeys, Circles, Channels into `adaptiveText` | Each adoption is its own commit with its own regression pass |
| L4 | Room-administration port, then Gate B | See open question O1 |
| L5 | `getMemberProfileModules` stops re-reading the profiles row twice (`lib/spotlight/data.ts:88,105`) | Shared loader with other callers |
| L6 | Named z-index ladder (`z-[150]`, `z-[80]`) | Stacking bugs are invisible until they are not |
| L7 | Resolve the dead `/profile` rail href (`lib/menus/defaults.ts:64`) | Investigate how the rail resolves it before "fixing" it by creating a route |
| L8 | Move `UnderlineTabs` out of `@/components/admin/` | Kit-location bug, not a page bug |

### Explicitly do not do

| Item | Why not |
|---|---|
| Move Activity / Posts tabs into `DetailTemplate.tabs` | The template renders tabs in the header band, ~600px above the list they switch. Framework purity loses to the control staying next to its list. |
| Adopt `DetailTemplate.sidebar` | Its `lg:w-80` aside collides with the 288px global rail that mounts at `lg`. At 1024px: `1024 − 64 − 192 − 40 − 12 − 40 − 288 ≈ 388px` of body, leaving ~68px of content. |
| Mutate `HERO_ACTION_CLASS` in place | Seven non-profile call sites, plus `channels/[id]/page.test.ts:46` asserts it by name and `journeys/[slug]/page.tsx:34-38` keeps a hand-synced CSS copy |
| Edit `design_handoff/**` | The DAWN sync is one-way and user-triggered by the phrase "sync DAWN" (`design_handoff/SYNC.md:9-21`) |
| A separate mobile action band | Would require double-mounting stateful client components; two `FriendButton` instances diverge the moment one runs `sendFriendRequest` |

---

## 5. The full spec

### 5.1 Header and contrast

#### 5.1.1 The layout (the part that needs no maths)

**Do not switch to a two-track grid at `lg`.** Grid *tracks* do not overlap, but overflowing *content* does, and this exact markup would reintroduce the collision between 1024px and 1279px:

- The 288px global member rail mounts at `lg` (`components/layout/app-shell.tsx:2003` sets `width: 288`), beside a `w-48` left nav (`:1936`), with `lg:gap-10` + `lg:ml-3` (`:1927`) inside `max-w-[105rem] px-4 sm:px-6 lg:px-8`.
- At a 1024px viewport that leaves roughly **388px of body**, and the hero lives inside it.
- `minmax(0,auto)` gives the actions track its full **max-content** contribution, and a `flex-wrap` container's max-content is every item on one unwrapped line. Three chips plus `lg:gap-x-8` consume nearly the whole inner width.
- The `1fr` lockup track then collapses toward zero, and its first child is `{leading && <span className="shrink-0">}` — an 80px avatar that cannot shrink. It overflows into the actions track.

**The fix: respond to the hero's own box, not the viewport.** Tailwind v4 (`package.json:82`, `"tailwindcss": "^4"`) ships container queries in core, and the repo uses none today, so this is the first — ⚠️ **verify the `@container` variant compiles before adopting** (`pnpm build`, then inspect the emitted CSS), and fall back to `2xl:grid` if it does not.

Replace `components/templates/page-hero.tsx:173-192` (the `<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">` block, anchored by content, not line number):

```tsx
          {/* TWO LANES, never one row. Below the container breakpoint the lockup and the
              actions are separate stacked rows, actions right-aligned under the name. Once
              the hero's OWN box is wide enough they become two grid tracks. Container query,
              not a viewport breakpoint: at `lg` the 288px global rail leaves ~388px of hero,
              which is narrower than a phone, and a viewport-keyed grid would put the two
              clusters side by side in a box that cannot hold them. The actions track is
              capped so it can never take the lockup's width, and `leading` drops `shrink-0`
              so the avatar yields before it overflows. */}
          <div className="@container/hero flex flex-col items-end gap-3 @2xl/hero:grid @2xl/hero:grid-cols-[minmax(11rem,1fr)_minmax(0,max-content)] @2xl/hero:items-end @2xl/hero:gap-x-8">
            <div
              className={`flex min-w-0 w-full items-end gap-3 @2xl/hero:w-auto${adaptiveText ? ' hero-zone' : ''}`}
              data-hero-zone={adaptiveText ? 'lockup' : undefined}
              data-media-tone={initialZoneTones?.lockup?.tone}
              data-media-plate={initialZoneTones?.lockup ? String(initialZoneTones.lockup.plate) : undefined}
            >
              {leading && <span className="min-w-0">{leading}</span>}
              <div className="min-w-0">
                {/* eyebrow / h1 / subtitle unchanged */}
              </div>
            </div>
            {actions && (
              <div
                role="group"
                aria-label={actionsLabel ?? 'Header actions'}
                className={`flex max-w-full flex-wrap items-center justify-end gap-2 @2xl/hero:max-w-[55%]${adaptiveText ? ' hero-zone' : ''}`}
                data-hero-zone={adaptiveText ? 'actions' : undefined}
                data-media-tone={initialZoneTones?.actions?.tone}
                data-media-plate={initialZoneTones?.actions ? String(initialZoneTones.actions.plate) : undefined}
              >
                {actions}
              </div>
            )}
          </div>
```

Add to `PageHeroProps`, after `actions`:

```ts
  /** Accessible name for the on-cover action cluster, so the group is announced as
   *  something other than an unlabelled list of buttons. Sentence case, e.g. "Profile actions". */
  actionsLabel?: string
  /** Server-measured tone per zone, so the FIRST paint already carries the right copy
   *  colour instead of flashing light copy. Omit for "not measured yet". Read only when
   *  `adaptiveText` is on. (Consumed from step 30 onward; the prop lands now so the markup
   *  is final.) */
  initialZoneTones?: Partial<Record<'lockup' | 'actions', { tone: 'dark' | 'light'; plate: 0 | 1 | 2 | 3 }>>
  /** True when the VIEWER owns this header, which is the only case where the sensor may
   *  cache what it measured back to the server (step 30). */
  ownsHeader?: boolean
```

**The overlay variant must not be orphaned.** The profile does not hard-code its variant: `page.tsx:423` passes `variant={header.layout}`, and `lib/elements/header.ts:87` gives an operator value set in `/admin/elements` precedence over the surface default (`setLayout ?? defaults?.layout ?? …`). If an operator flips the layout to `overlay`, the profile renders `page-hero.tsx:194-209`, which still uses `text-on-media` (`:200`) and `text-on-media/85` (`:204`) with `legible = ''` under `adaptiveText`. So:

1. Emit `data-hero-zone` in the **overlay branch too** — one zone wrapping the centred lockup, one on its actions row.
2. **Keep** the section-level `.hero-adaptive-text[data-media-tone]` rule as the default and let `.hero-zone[data-media-tone]` override it. Do not replace one with the other.
3. Keep `legible` falling back to `on-image-text` whenever a hero has `adaptiveText` but no measured zone.
4. Add a source-shape guard asserting that **every** branch of `page-hero.tsx` that renders `text-on-media` also renders a `data-hero-zone` under `adaptiveText`.

**Phone geometry, stated as a budget.** `HEADER_MIN_H.standard` is `min-h-[15rem] sm:min-h-[20rem]` — 240px on a phone. At 375px: avatar 64px + eyebrow ~16px + name ~24px + `@handle` ~18px ≈ 140px of identity, plus a 34px chip row, plus 48px of `py-6` padding = 222px. **That fits 240px only if the cluster is three chips or fewer**, which is exactly why the cover diet (step 6) is a **prerequisite**, not an option. Add "375px, the cover does not grow" as an explicit acceptance row.

#### 5.1.2 The maths (corrected)

**The statistic: worst tile, not mean.** Divide each zone into an 8×4 grid, compute each tile's mean relative luminance in linear light, and require the chosen tone to clear `MIN_HERO_CONTRAST` (4.5) against **every** tile. A tile is roughly a few glyphs wide, so one stray bright pixel does not force a plate but a whole tile of white coat does. It is the question a reader actually asks.

**🔴 The plate ladder was modelled in the wrong colour space, and the correction changes the recommendation.** The earlier draft composited the plate in linear light (`a*alpha + b*(1-alpha)` on luminances), but the CSS plate is `color-mix(in srgb, …)` over a photo, which the compositor alpha-blends in **gamma-encoded sRGB**. Verified against the real token values in `app/globals.css` (`--color-on-ink`, whose red channel is 243, and `--color-ink`, whose red channel is 20; read them from the file rather than pasting literals into code):

| Case | Linear model said | sRGB actually renders |
|---|---|---|
| 25% cream over a black tile | L = 0.2144 → **4.70:1** for dark copy | channel 61 → L ≈ 0.047 → **1.72:1** 🔴 |
| 45% cream over a black tile | — | L ≈ 0.153 → **3.61:1** 🔴 |
| 70% cream over a black tile | — | L ≈ 0.403 → **8.05:1** ✅ |
| 25% ink over a white tile (light copy) | — | L ≈ 0.554 → **1.50:1** 🔴 |
| 70% ink over a white tile (light copy) | — | L ≈ 0.103 → **5.92:1** ✅ |

Every plate-1 verdict in the earlier proof table was wrong by roughly 4× in luminance. **The consequence is the opposite of what was claimed:** a genuinely bimodal cover needs rung 3, i.e. a visible bar behind the name. The sentence "the plate almost never needs to go past step 1" is struck.

**What that means for the design.** Three corrections:

1. **Model the composite in sRGB.** `resolveZoneTone` must linearise the tile, blend in gamma-encoded sRGB per channel (`srgbEncode(tile)*(1−α) + srgbEncode(backdrop)*α`), then re-linearise for the contrast ratio. **Or** author the plate in a linear space (`color-mix(in oklab, …)` / `in srgb-linear`) so the CSS matches the model, and say so in the CSS comment. Pick one, state it, re-derive the whole ladder, and add a test asserting the resolver's predicted composite luminance for one known pair against a hand-computed sRGB blend so this class of error cannot recur.
2. **Rung 1 is the halo, not a rectangle.** The shipped `on-image-text` text-shadow is a per-glyph treatment that is already known acceptable on real photos and paints no bar. Make the ladder: **0 = nothing · 1 = halo · 2 = halo + plate · 3 = halo + strong plate.** That keeps the photo clean for the common case and only paints a rectangle when the photo is genuinely hostile.
3. **The zones are much smaller than the old band, which is the real reason plates will be rare.** `HERO_TEXT_REGION` is 62% of the hero width and half its height. A lockup zone is the actual box of the actual text. Most real covers are locally uniform inside a box that small and will resolve at rung 0 or 1.

**🔴 The unmeasured state must be tone-free.** `--color-on-media` defaults to `--color-on-media-light` (`app/globals.css:57`, verified). An "unmeasured" rule that keeps that default and adds a 25% ink plate is *still a tone guess*: on a bright cover it composites to light-on-light at roughly 1.13:1 — the exact failure the owner photographed, wearing a plate. **Decision: option (b).** Unmeasured renders the shipped `on-image-text` halo at full strength and **no plate**, i.e. exactly today's pre-ADR-830 behaviour, which is a known-acceptable baseline rather than a new untested one. Add a test asserting the unmeasured rule's composite clears `MIN_HERO_CONTRAST` against both a white and a black backdrop.

#### 5.1.3 The CSS

**Anchor every edit by a searchable marker, never by line number.** The working tree has 22 uncommitted modified files including `app/globals.css`, and the earlier draft's Section 1 line references were all off by roughly 130 lines. Verified current positions:

| What | Where (verified) | Marker to search for |
|---|---|---|
| On-media tokens | `app/globals.css:53-57` | `--color-on-media-light:` |
| `@theme inline` mapping of `--color-on-media` | `:878` | `--color-on-media:         var(--color-on-media)` |
| `.rank-badge` block, including `.rank-dot` | `:1189-1207` | `.rank-badge {` |
| `.hero-adaptive-text` + `.hero-text-scrim` block | `:1415-1450` | `/* ── Content-aware hero text (ADR-830)` |
| The `.reveal` / marquee block the old reference would have deleted | `:1288-1327` | `/* ── Scroll-reveal (marketing)` |

Replace the block beginning `/* ── Content-aware hero text (ADR-830)`:

```css
/* ── Content-aware hero text, per ZONE (ADR-894, extends ADR-830) ───────────────
   A PageHero with `adaptiveText` renders its overlaid copy in `text-on-media`. Each ZONE
   (the identity lockup, the action cluster) resolves its OWN tone and its OWN local
   treatment from the pixels behind IT, because one photo can be dark under the name and
   bright under the buttons. Stamped by HeroAdaptiveText:
     data-media-tone="light"   -> the backdrop under THIS zone is bright, flip to dark copy
     data-media-plate="0..3"   -> 0 nothing · 1 halo · 2 halo+plate · 3 halo+strong plate
   The SECTION-level rule below stays as the default so a hero with no measured zone (the
   overlay variant, a legacy surface) still gets a tone; the zone rule overrides it.
   A zone with NO data-media-plate has not been measured: it keeps the shipped
   `on-image-text` halo and NO plate. That is the pre-ADR-830 baseline, which is known
   acceptable on real photos. It must NEVER add a plate on top of the light default, which
   composites light-on-light on a bright cover.
   NOTE ON COLOUR SPACE: the plate below is authored in `srgb-linear` so the browser's
   composite matches resolveZoneTone's model in lib/images/hero-contrast.ts. Authoring it
   in plain `srgb` renders roughly 4x darker than the model predicts. Do not change the
   space without re-deriving HERO_PLATE_ALPHAS. Tokens only, no raw hex. */
.hero-adaptive-text[data-media-tone="light"] {
  --color-on-media: var(--color-on-media-dark);
}
.hero-adaptive-text .hero-zone {
  --hero-text-backdrop: var(--color-ink);
  --hero-plate-alpha: 0%;
  --hero-plate-blur: 0px;
  position: relative;
  border-radius: var(--radius-card, 1rem);
}
.hero-adaptive-text .hero-zone[data-media-tone="light"] {
  --color-on-media: var(--color-on-media-dark);
  --hero-text-backdrop: var(--color-on-ink);
}
/* Rung 1 is the shipped per-glyph halo, NOT a rectangle: it keeps a clean photo clean. */
.hero-adaptive-text .hero-zone[data-media-plate="1"],
.hero-adaptive-text .hero-zone:not([data-media-plate]) {
  text-shadow:
    0 1px 2px color-mix(in srgb, var(--color-ink) 55%, transparent),
    0 2px 12px color-mix(in srgb, var(--color-ink) 45%, transparent);
}
/* Rungs 2 and 3 add a local pad. Alphas MUST stay in step with HERO_PLATE_ALPHAS. */
.hero-adaptive-text .hero-zone[data-media-plate="2"] { --hero-plate-alpha: 45%; --hero-plate-blur: 4px; }
.hero-adaptive-text .hero-zone[data-media-plate="3"] { --hero-plate-alpha: 70%; --hero-plate-blur: 8px; }
/* The plate. z-index: -1 is LOAD-BEARING. `.hero-zone` is `position: relative; z-index: auto`,
   so it establishes NO stacking context; a negative-z pseudo-element therefore paints inside
   the nearest ancestor stacking context (PageHero's `z-10` content div), above the cover and
   the overlay but BELOW this zone's own text. Without it, CSS painting order puts a positioned
   descendant (step 8) ABOVE the block-level (step 4) and inline (step 7) in-flow content of the
   same stacking context, i.e. the ink wash and the backdrop blur land ON TOP of the name. */
.hero-adaptive-text .hero-zone::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -0.75rem -1rem;
  border-radius: inherit;
  pointer-events: none;
  background: color-mix(in srgb-linear, var(--hero-text-backdrop) var(--hero-plate-alpha), transparent);
  backdrop-filter: blur(var(--hero-plate-blur));
  transition: background 200ms ease, backdrop-filter 200ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .hero-adaptive-text .hero-zone::before { transition: none; }
}
```

⚠️ **Verify `z-index: -1` in devtools on fixture V5 before merging.** The alternative (giving every zone child `position: relative`) is more fragile, because the `leading` avatar and the eyebrow chip come from callers.

**Two plate artefacts that need a decision, not an assumption:**

1. **The avatar.** The lockup zone contains `leading`, an 80px round avatar. A rounded rectangle painted behind a circle on a photo is a visible artefact. **Decision: exclude `leading` from the plated zone.** Wrap only the text stack in `data-hero-zone="lockup"` and let the avatar sit outside it. This also tightens the sampled region to the pixels actually behind glyphs, which is strictly better measurement.
2. **Two plates on one photo.** If both zones need a plate, the header shows two pads on one image, and the action pads sit on top of three chips that already carry their own glass. **Rule: if either zone resolves above rung 1, both zones step to the higher rung**, so the header reads as one treatment rather than two patches. Put fixture V4 in front of the owner before this ships.

#### 5.1.4 The sensor

Rewrite `run()` in `components/templates/hero-adaptive-text.tsx`. Four changes:

**(a) Sample the same-origin bytes the browser already has — and gate on the prop, not the DOM.**

```ts
      // The page already downloaded and decoded this cover through next/image, so the browser
      // has it at `/_next/image?url=…` — SAME-ORIGIN, already cached, readable from a canvas
      // with no CORS grant and no second full-resolution download. `currentSrc` is a plain DOM
      // property, not a Next API, and gives the exact srcset entry on screen.
      //
      // GATE ON `coverImage`, NOT ON THE DOM. PageHero renders the cover <Image> only inside
      // `{coverImage ? … : <div class="…bg-gradient-to-br…" />}` (page-hero.tsx:138-147). With no
      // cover, the `leading` slot's ProfileAvatar is a next/image <Image> and would be the FIRST
      // and only <img> in the section, so a bare querySelector('img') resolves tone and plate
      // from the member's own FACE against a backdrop that is actually a gradient.
      const rendered = coverImage ? el.querySelector<HTMLImageElement>('img[data-hero-cover]') : null
      const src = rendered?.currentSrc || rendered?.src || coverImage
```

Give the cover `<Image>` a `data-hero-cover` attribute in step 4, so the query also survives anyone adding a second image to the band later.

**(b) Decode once per run, then measure each zone.** Split the sampler so the decode is not repeated per zone, and cache the decoded source across `ResizeObserver` re-runs keyed on `src`:

```ts
export function loadSampleSource(src: string): Promise<CanvasImageSource | null>
export function tileLuminancesFrom(source: CanvasImageSource, opts: {…}): number[] | null
```

Two zones × a debounced resize observer would otherwise mean many decode cycles while a member drags a window, which cancels out the very saving the same-origin change buys. This split also gives the pure half a testable seam.

**(c) Leave a failed zone unmeasured.** Delete the `mediaLuminance === null` branch at `:81-93` entirely. On failure, `delete zone.dataset.mediaTone` and `delete zone.dataset.mediaPlate`, and let the CSS unmeasured rule apply the halo. Report once per page session via Sentry with `reason` (`'no-canvas' | 'tainted' | 'no-image' | 'zero-size'`) and `host` (`new URL(src).host`, never the full URL — cover URLs are member content).

**(d) Re-measure when boxes move.** One `ResizeObserver` on the hero `<section>`, debounced 150ms, disconnected on unmount. Do **not** observe the zones themselves: the plate changes their painted size, which is a feedback loop.

**Threading `ownsHeader`.** The self-heal write (step 30) is called from `HeroAdaptiveText`, which is mounted by `PageHero` (`page-hero.tsx:154-161`). The sensor has no other way to learn it. Add `ownsHeader?: boolean` to `PageHeroProps` **and** `HeroAdaptiveTextProps`, destructure it, pass it down, and pass `ownsHeader={isOwner}` from `page.tsx:433`. `cacheOwnHeaderTone` must be `'use server'`, must use the **user-scoped** client, and its `auth.getUser` + `.eq('auth_user_id', user.id)` satisfies both the GUARD and SCOPING_FILTER regexes in `scripts/check-authz-guards.mjs:37-63`.

#### 5.1.5 Making every on-cover control adaptive

**This depends on the cover diet.** The earlier drafts contradicted each other: one added an `onMedia` prop to `TipButton` and a `triggerClassName` to `ProfileSettingsDrawer`; the other moved both **off** the cover entirely. **Resolution: the cover diet (step 6) is in, so only `FriendButton` needs the prop.** `TipButton` and `ProfileSettingsDrawer` keep their existing page-canvas classes, which become correct by construction once they sit on a page surface, and need **no component edit at all**.

| Control | After the diet | Change |
|---|---|---|
| `FriendButton` | Stays on the cover | Add `onMedia?: boolean`. Keep the primary "Add friend" state on `bg-primary text-on-primary` (an accent CTA is meant to stand out and is legible on any photo); swap the pending and accepted states to `HERO_ACTION_CLASS_ADAPTIVE` |
| `Message` (`MessageMemberButton`) | Stays on the cover | Takes `className={HERO_ACTION_CLASS_ADAPTIVE}` |
| `QrShareDropdown` | Stays on the cover | Takes `className={HERO_ACTION_CLASS_ADAPTIVE}` |
| `TipButton` | Moves to the band | ❌ no edit |
| `ProfileSettingsDrawer` | Moves to the band | ❌ no edit |
| `Save contact` | Moves to the band | Takes `BAND_ACTION_CLASS` |
| `.rank-badge` eyebrow | Stays | Leave it. It paints an opaque `color-mix(var(--rank) 14%, var(--color-surface))` background, so it is legible on any photo — by accident rather than by contract, but changing it touches every rank badge site-wide. Record the reasoning in the ADR so it reads as a decision. |

Add beside `HERO_ACTION_CLASS` (do **not** mutate it):

```ts
/** The header-action button style for an ADAPTIVE hero (`adaptiveText`). Same geometry as
 *  HERO_ACTION_CLASS, but colour/border/glass come from `.hero-chip` in globals.css, which
 *  reads the ZONE's `--color-on-media`. Use this for any button in the `actions` slot of a
 *  hero with `adaptiveText` on; use HERO_ACTION_CLASS everywhere else. */
export const HERO_ACTION_CLASS_ADAPTIVE =
  'hero-chip inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors'
```

Regression-eyeball the seven non-profile `HERO_ACTION_CLASS` call sites (`circles/[slug]:371`, `journeys/[slug]:205`, `journeys/[slug]/learn:199`, `channels/[id]:435,445,455,465`). They must be byte-identical, and `app/(main)/channels/[id]/page.test.ts:46`, which asserts the class by name, must stay green without edits.

---

### 5.2 Layout and information architecture

#### The page order

Two structural changes:

- **Delete the four `order-*` utilities** at `page.tsx:481` (`order-2 … xl:order-1`) and `page.tsx:567` (`order-1 … xl:order-2`). DOM order is already content-then-sidebar, so removing them puts the person before the gamification on every viewport below `xl`. Today the reverse ships.
- **Keep `grid gap-6 xl:grid-cols-3`.** At 1280px that yields roughly 430px content / 205px sidebar; at 1680px roughly 690px / 330px. The 205px column is exactly why five sidebar boxes become three.

| # | Region (visitor, signed in) | Who sees it |
|---|---|---|
| 1 | Tip thank-you banner | `?tip=success` return only |
| 2 | Cover + identity lockup | everyone |
| 3 | On-cover actions: `Friends` · `Message` · QR | signed in |
| 4 | **Band line 1** — region · `Joined {month year}` · status chips ‖ **`Block` · `Act as`** | everyone / signed-in non-owner |
| 5 | **Band line 2** — `Save contact` · `Tip` · `Settings` (see below) | conditional |
| 6 | Bio | everyone |
| 7 | Hairline rule (`PageAdminBar asDivider`) | everyone |
| 8 | **Associations panel** | everyone (tiered) |
| 9 | `PrivateContactPanel` | viewer with a linked contact |
| 10 | `ConnectionPanel`, in `<Suspense>` | signed-in non-owner, not blocked |
| 11 | `MemberSupportPanel`, in `<Suspense>` | host+ staff |
| 12 | Member's page-builder grid | everyone |
| 13 | Composer | signed in |
| 14 | Section header + Activity / Posts tabs | everyone |
| 15 | Timeline / Posts, in `<Suspense>` | everyone |
| S1 | Sidebar: **Standing** (rank + progress + Zaps/Gems/Streak + Achievements) | everyone |
| S2 | Sidebar: **Frequency Signature** | owner always; visitor only when non-empty |
| S3 | Sidebar: **Awards** | when non-empty |

> Regions 9 and 10 are listed in the order they render **today** (`page.tsx:484-493`, `PrivateContactPanel` before `ConnectionPanel`). No step reorders them; earlier drafts listed them backwards.

The `{n} circles` item is **deleted** from region 4 (privacy; see 5.3) and replaced by tier B inside region 8. This deletion ships in **step 3**, the same commit as Edit 1, so the live leak does not wait on the associations PR.

**Owner view differs in content, never in geometry.** Band line 1 carries `Edit profile` where a visitor carries `Block`; band line 2 carries `Save contact` only; the on-cover cluster is QR alone. One band shape, one sidebar shape, one content column shape.

#### Band line 2, specified in full

Named in four places and specified in none by the earlier drafts. Here it is. It sits **after** the `justify-between` stats row (`page.tsx:451-469`) and **before** `EditableIdentity`:

```tsx
// The band control row: every control that reads BELOW the cover, on the page surface.
// Gated as a whole so an empty row renders NOTHING rather than reserving space — a
// signed-out visitor, or a visitor of a member with no vCard and no Connect account, sees
// no row at all.
{(vcardEnabled || (user && !isOwner && !isBlocked && canTipRecipient) || isStaffViewer) && (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    {vcardEnabled && (
      <a href={`${profilePath}/vcard`} className={BAND_ACTION_CLASS}>
        <Contact className="h-3.5 w-3.5" />
        Save contact
      </a>
    )}
    {user && !isOwner && !isBlocked && canTipRecipient && (
      <TipButton toProfileId={profileId} recipientName={firstName} />
    )}
    {isStaffViewer && <ProfileSettingsDrawer /* …unchanged props… */ />}
  </div>
)}
```

with, near the top of the file:

```tsx
// ONE chrome for every control that reads BELOW the cover, on the page surface. Page tokens
// (not the on-ink glass) because these no longer ride a photograph. Byte-identical to the
// class Edit profile used inline before, so the owner's control is unchanged and the
// visitor's controls now match it.
const BAND_ACTION_CLASS =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text'
```

**Honest note on chrome count.** `TipButton` and `ProfileSettingsDrawer` keep their own internal classes, so the row carries three treatments rather than one. That is acceptable *off a photograph* (all three are page-canvas tokens on a page canvas, which is contrast-defined) in a way it was never acceptable *on* one. If the owner wants strict uniformity, both components need a `className` prop; that is a separate, cheap commit and is not required for correctness.

#### Right column: five boxes to three

At `xl` the column is roughly 205px. Into it go five stacked `rounded-2xl border border-border bg-surface shadow-sm` boxes, four of which title themselves with `<p className="text-sm font-bold">` — a fake heading. A screen-reader user rotoring by heading gets **nothing** from the entire right column.

| Before | After |
|---|---|
| `ProfileStandingCard` box (`page.tsx:664`) | `SidebarCard title="Standing" Icon={Trophy} action={rankBadge}` |
| `Achievements` box (`page.tsx:595-604`) | Folded into Standing as an `<h4>` group below a `border-t border-border` divider |
| Frequency Signature bare `<div>` + `SectionHeader` (`:583-592`) | `SidebarCard title="Frequency Signature" Icon={Compass}`, gated `isOwner || signature.total > 0` |
| `ProfileAwards` box with two `<p>` titles | `SidebarCard`; still returns `null` when both groups are empty |

Plus, inside Standing: drop the duplicate `Rank` row (the badge now lives in the card header `action` slot), change the progress track from `bg-warning-bg/60` (an alarm colour borrowed as a neutral) to `bg-surface-elevated`, and promote the two `text-2xs` progress lines to `text-xs`. `SidebarCard` does not pad its children, so card bodies supply their own `p-4`.

#### Empty states

| # | Where | Today | Fix |
|---|---|---|---|
| E1 | Timeline (`components/feed/profile-feed.tsx:254-261`) | Hand-rolled dashed box, `No activity yet.` | `EmptyState` with a real `action` for the owner; a plain sentence for a visitor. **Add `import { EmptyState } from '@/components/ui/empty-state'`** — that file imports neither `EmptyState` nor anything from `components/ui` today, so the commit fails `tsc` without it. Add `firstName` to the props and derive `isOwner` as `myProfileId === profileId`. |
| E2 | Posts tab (`components/feed/profile-posts.tsx:46-58`) | Correct component, weak owner copy | Owner: `Your posts collect here. Write your first one in the box above.` Visitor: `When they share a post it will show up here.` **Deliberately no action** — the live `Composer` sits 40px above. |
| E3 | Frequency Signature (`components/profile/frequency-signature.tsx:96-108`) | Hand-rolled dashed box, shown to visitors | Return `null` for a visitor. For the owner, **do not use `EmptyState`** — it is `px-6 py-12 text-center` with an `mx-auto max-w-sm` description (`components/ui/empty-state.tsx:38-48`), which becomes a ~260px block of centred text in a 205px column, i.e. the tallest primitive in the kit dropped into the narrowest slot. Render two lines of `text-xs text-muted` plus a text link inside the card body instead. Also add the `EmptyState` import if any other branch of that file needs it. |
| E4 | Achievements (`page.tsx:259-268, 716-743`) | Four grey `0/1` chips | Add a `hint` per reward, shown at zero progress **for the owner only** (see below) |
| E5 | Bio (owner) | `Add a short bio so people know who you are.` | ✅ keep exactly |
| E6 | Awards | Returns `null` | ✅ the correct module contract |

**E3 copy, settled:** `Your signature fills in across the four Pillars (Mind, Body, Spirit, Expression) as you log Practices.` "Takes shape" is soft, and "log practice" mixed the canon proper noun with a lowercase verb.

**E4 must be owner-gated.** `AchievementChip` renders unconditionally in the sidebar — verified, `page.tsx:599-603`, no `isOwner` branch. Imperative second-person hints ("Circle Up — Join a Circle", "Spark — Earn 50 Zaps") shown to a *visitor* read either as an instruction to the wrong reader or as a public nag about the member. CONTENT-VOICE §10 item 1 fails outright.

- Owner: label + hint at zero progress, `{current}/{target}` once there is progress, star when earned.
- Visitor: label alone for unearned achievements (no fraction, no hint), star when earned.
- **The full diff must include the props signature and the call site**, or `tsc` fails: add `hint?: string` and `isOwner: boolean` to `AchievementChip`'s props (`page.tsx:716-725`) and `hint={r.hint} isOwner={isOwner}` at the call site (`page.tsx:601`). The `rewards` `.map`/`.sort` chain already preserves extra keys, so nothing else changes.
- Add a render test asserting the visitor markup contains none of the four hint strings.

#### The new-member profile (the region no earlier draft specified)

**The problem the rest of this plan would otherwise create.** Walk a stranger viewing a member who joined three days ago, *after* every other change lands: cover, one facts line with a lone `Block` link, bio, associations panel (`null`, they have built nothing), `ConnectionPanel` (`null`, no tie), `PrivateContactPanel` (`null`), builder grid (starter links), composer, "Nothing here yet", and one Standing card at zero. That is a **shorter** page than today, not a more inviting one — and the associations box, the region specced as "the answer to why this page is here", is `null` in exactly the case the screenshot shows.

**The floor: one substance region always renders for a visitor.** Specified:

1. **The Frequency Signature renders at zero as a real four-Pillar constellation**, not a dead box, for visitors as well as owners. It is a shape, not an emptiness. Gate it `isOwner || signature.total > 0 || isNewMember` where `isNewMember` is "joined within 30 days".
2. **Tier B of the associations panel** (`Circles you are both in`) renders whenever it is non-empty, regardless of tier A being zero. Two strangers with a Circle in common is the most useful thing this page can tell either of them.
3. **The composer's empty timeline carries an invitation, not a shrug:** `Joined {month}. Say hello.` for a signed-in visitor, tied to the composer directly above.

**Owner sign-off on this one screen is a gate.** "Stranger viewing a 3-day-old member" is a required cell in the visual QA matrix, alongside the eight cover fixtures.

#### Responsive

Cover heights: `HEADER_MIN_H.standard` = `min-h-[15rem] sm:min-h-[20rem]` (`lib/layout/header-sizes.ts:25`).

| Breakpoint | Header | Band | Body |
|---|---|---|---|
| **< 640 phone** | Cover 240px. Lockup stacked; **actions right-aligned on their own line under it** (`flex flex-col items-end gap-3`). Three chips maximum, or the cover grows. | Line 1 wraps; `Block` · `Act as` right-aligned on their own line via `ml-auto`. Line 2 wraps the same way. | Single column, **content first** |
| **640-1023** | Cover 320px. Same stacked geometry; the hero's own box is still under the container breakpoint. | Line 1 typically one line | Single column, same order. Global rail not mounted, so the content column is wide |
| **1024-1279 (`lg`)** | Same stacked geometry. **This is the width the two-track grid would have broken:** the 288px rail mounts here, leaving ~388px of hero. The container query keeps it stacked. | unchanged | Still single column, correctly |
| **≥ 1280 (`xl`)** | Hero box is finally wide enough: **two lanes side by side** | unchanged | `xl:grid-cols-3`: content ≈430px, sidebar ≈205px |
| **≥ 1536** | Two lanes | unchanged | ≈690px / ≈330px at the `max-w-[105rem]` ceiling |

Two checks that cannot be unit-tested: at 390px confirm the cover does not become a button dump and does not grow past 240px; at 1280px confirm the consolidated sidebar cards do not overflow at 205px (the rank badge in `SidebarCard`'s `action` slot is the tightest element).

#### Performance

| # | Blocking work | Where | Fix | Risk |
|---|---|---|---|---|
| P1 | `profiles` row read is serial with `auth.getUser()` | `page.tsx:75-101,130-131` | `Promise.all` them; they are independent | 🟢 |
| P2 | `await resolveHeaderElement(...)` | `page.tsx:405` | 🔴 A lone serial 4th wave, the last thing before `return`, **gating the hero**. Move `overlayStyle` / `overlayColor` up beside `headerFocus` and fold it into the existing 14-read `Promise.all` | 🟡 |
| P3 | `ConnectionPanel` (async child, `my_orbit` RPC with `_limit 100`) | `page.tsx:487-493` | 🔴 No boundary → blocks the route. Wrap in `<Suspense fallback={<PanelSkeleton />}>` | 🟢 |
| P4 | `MemberSupportPanel` (async child) | `page.tsx:496` | 🔴 No boundary. Wrap it | 🟢 |
| P5 | Member block grid | `page.tsx:505-511` | Boundary exists but `fallback={null}` reserves no space → guaranteed CLS on every open. Use `<PanelSkeleton className="h-48" />` | 🟢 |
| P6 | Associations panel (new) | new | Its own `<Suspense fallback={<PanelSkeleton className="h-40" />}>` | 🟡 |
| P7 | Viewer's own profile row | `page.tsx:144-152` | Genuinely serial (needs `user.id`). **Keep** | — |

Add one shared fallback beside `ProfileFeedSkeleton`, built on the `Skeleton` primitive (`components/ui/skeleton.tsx`), and use the primitive in `ProfileFeedSkeleton` too (it hand-rolls eight `animate-pulse` divs today):

```tsx
// Dimension-matched fallbacks (PAGE-FRAMEWORK §5.4) — each reserves the height of the panel
// it stands in for, so a streamed section never shifts the column beneath it.
function PanelSkeleton({ className = 'h-36' }: { className?: string }) {
  return (
    <div className={`mb-6 rounded-2xl border border-border bg-surface p-4 shadow-sm ${className}`} aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  )
}
```

Verified against `node_modules/next/dist/docs/01-app/02-guides/streaming.md`: "Each `<Suspense>` boundary is an independent streaming point." An async child with **no** boundary of its own falls back to the route boundary, i.e. it blocks the whole page.

---

### 5.3 Associations

New module: `lib/people/associations.ts` (**not** `lib/profile/associations.ts`; earlier drafts disagreed and this is the owning name). New component: `components/profile/profile-associations.tsx`, an async Server Component in its own `<Suspense>`, first in the content column.

#### Tier A: what a member built

Six reads, one `Promise.all` wave, each with `{ count: 'exact' }` alongside a `.limit(3)` peek so one round trip serves both the number and the names.

| Kind | Filter (this **is** the privacy enforcement) | Basis |
|---|---|---|
| **Circles** hosted | `.eq('host_id',p).eq('unlisted',false).in('status',['forming','active','inactive']).is('space_id',null)` | `circles: authenticated read non-archived`; `unlisted` is the browse-hiding flag the index honours (`lib/circles/index-data.ts:239`); **`space_id`** per below |
| **Spaces** owned | `.eq('owner_profile_id',p).eq('status','active').neq('visibility','private').neq('type','root')` | `spaces_read_active` (`20260711080000:48-53`). `NULL` visibility also drops under SQL `<>` semantics — fail-closed |
| **Events** hosted | `.eq('host_id',p).eq('status','published').in('visibility',['public','unlisted']).eq('is_cancelled',false).is('removed_at',null).is('space_id',null).gte('starts_at',now)` | Mirrors the vetted `public_organizer_events` projection |
| **Journeys** published | `.eq('author_id',p).eq('visibility','public').eq('status','approved').not('published_at','is',null).is('space_id',null)` | `journey_plans_select`; **plus the status filter** per below |
| **Practices** published | `.eq('created_by',p).eq('status','approved').eq('is_public',true).is('space_id',null)` | `practices: public read` is `using (true)`, so the app must narrow it |
| **Classifieds** listings | `.eq('author_id',p).eq('status','active')` | `market_listings_select` |

🔴 **`.is('space_id', null)` appears on FOUR tables, not three.** `supabase/migrations/20260711090000_space_content_isolation.sql:53-71` creates the identical `as restrictive for select using (can_view_space_content(space_id))` wall on **five** tables: `circles`, `events`, `practices`, `journey_plans`, `programs`. `circles.space_id` exists (`lib/database.types.ts`). The panel reads through `createAdminClient()`, where RLS never fires, so **the app filter is the only enforcement**. Without it, a Circle owned by a **Private Space** and hosted by this member is named and deep-linked to every signed-in stranger — worse than the `{n} circles` leak this panel exists to replace. `programs` is correctly out of v1. The privacy guard asserts **four** occurrences, and the check is mechanical: re-read `scripts/rls-deny-all.txt` and the restrictive-policy set before adding any seventh kind.

🔴 **Journeys need `.eq('status','approved')`.** The enum is confirmed in tree: `supabase/migrations/20260605120000_community_library.sql:47` adds `status text not null default 'approved' check (status in ('draft','pending','approved','rejected'))`. A plan that was published and then **rejected** in review keeps `published_at` and `visibility='public'`, so it would be counted and linked from the member's profile — moderation-rejected content on a member-facing surface, disagreeing with whatever `/journeys` shows. That breaks the panel's own count-equals-list rule. Match `lib/journeys/*`'s index filter exactly so the tile count equals what a viewer can find by browsing.

**Deliberately excluded from tier A**, each with its reason: Events attending (`event_rsvps` is host-private), Space seats (`space_members_read` is own-or-admin; a seat is a private employment-shaped fact, ownership is not), Channels tuned in to (`topical_channel_memberships: read own`), Stewardships, Journeys completed / enrolled, Practices logged, Friends count, library assets, podcasts, recordings, housing seeker profiles, contacts, event guests. Co-hosted events (`event_cohosts` is as visible as the event) and Market / Shop / Housing listings (they carry an `owner_kind` discriminator) are ⏳ v2, not 🔴 never.

**One honest gap, stated rather than hidden.** Space-scoped content is under-counted on purpose: a community Journey counts, a Journey published inside a Space does not. **Under-counting is the correct failure direction.** Lifting it needs either a viewer-aware read (breaking the viewer-independence rule) or a `security definer` RPC that runs `can_view_space_content` for real. Sketch kept in the docs; **do not build it in the same PR.**

#### Tier B: in common with you

One extra read pair, viewer-scoped: the intersection of the viewer's active `memberships` and the target's. Renders as one row, `Circles you are both in`, with names. This is legal because `memberships` is readable by the member, their co-members and the host, and the viewer already knows every Circle on the list. It renders even when tier A is zero, which is what stops a new member's profile going from one association to none.

#### Tier C: your own picture

On your own profile only, behind the "only you can see this" pattern `PrivateContactPanel` already establishes: Circles you are in, Channels you follow, Space seats you hold, Journeys you are enrolled in. Own rows, zero risk, and it is what "everything they are associated with" means for the person who asked for it.

#### Composition and copy

| Zone | Component | Notes |
|---|---|---|
| Heading | `SectionHeader` | No `count` prop; the tiles carry the numbers. No hand-rolled header, so `check:headers` stays green |
| Tiles | `StatCard`, **`bordered={false}`** | The soft `bg-surface-elevated/60` variant, not a sixth hard box |
| Grid | `grid grid-cols-2 gap-3 sm:grid-cols-3` | Three tiles still fit at the ~430px `xl` content width |
| Peek | Plain `<Link>` rows under the grid, capped at six total | Every count gets a real destination |

| Slot | Visitor | Owner |
|---|---|---|
| Section title | `What {firstName} runs` | `What you run` |
| Circles | `Circles` / `Hosting` | same |
| Spaces | `Spaces` / `Running` | same |
| Events | `Events` / `Upcoming` | same |
| Journeys | `Journeys` / `Published` | same |
| Practices | `Practices` / `Published` | same |
| Classifieds | `Classifieds` / `Active` | same |
| Peek row chips | `Circle` · `Space` · `Event` · `Journey` · `Practice` · **`Classifieds listing`** | same |
| In common | `Circles you are both in` | — |
| Owner footnote | — | `Drafts and private items stay off this list.` |
| Approximate count | `50+` | same |

**Naming corrections applied.** `Classifieds listing`, not "Classifieds post": `docs/NAMING.md:433-434` defines the qualified form explicitly. `Running`, not "Owner", for the Spaces detail, so it is parallel with `Hosting` / `Upcoming` / `Published` / `Active`. `What {firstName} runs`, not "has built", which strained over a Classifieds listing.

**Zero states.** Visitor with tiers A and B both empty: render nothing (`ProfileAwards`'s module contract). Visitor with tier A > 0: only non-zero tiles, never a grid of zeroes. Owner with tier A = 0: the section renders with at most **three** invitations in a fixed priority order (`Host a Circle` → `/circles`, `Host an event` → `/events/new`, `Publish a Journey` → `/journeys/new`), plus the footnote. ⚠️ **Confirm `/circles/new` exists before pointing at it**; `/events/new`, `/journeys/new` and `/spaces/new` are confirmed in the tree.

**Where every number goes.** Only Events has a real per-host index (`/discover/events/organizer/{handle}`, backed by `public_organizer_events`). The other five land on the browse index and the peek rows carry the real destinations. **No filtered-index query parameter is invented.** The right fix is a `?host=<handle>` facet on `/circles`, `/journeys` and `/practices`; that is a separate workstream, flagged for the owner.

**Events count runs through `collapseSeries` before counting**, or the tile reads "Events 12" for one weekly cowork. `lib/events/series.ts` belongs to `docs/EVENTS-SERIES-BUILD-PLAN.md` and is not respecced here. **Do not hand-roll a local fold.** The three profile-adjacent consumption points, for the record:

| # | Point | Owner |
|---|---|---|
| C1 | `components/sidebar/rail-panels.tsx:40-64` — the global rail's `Upcoming events` tile, two `.limit(3)` reads. **This is the "Meld ×3" in the screenshot.** | Shell chrome, not profile code. The profile inherits the fix. The tile also needs a series row treatment or it will just truncate silently. |
| C2 | `components/page-editor/blocks/profile.tsx:1927-1957` — the `SpaceEvents` block, which renders **inside the profile body** via `ProfileSpotlightBlocks` | A genuine profile-page consumption point |
| C3 | The associations Events tile | This plan, step 21, **blocked on `lib/events/series.ts`** |

---

### 5.4 Messaging

#### Step-level plan for "Reconnect opens the dock"

**The blocking fact, confirmed in source:** the dock **cannot** currently be opened at a named conversation. `components/vera/vera-launcher.tsx:82`'s `onOpenChat` reads no `detail`; `dock-chat.tsx:50`'s open thread is settable only by row clicks; the panel is conditionally mounted (`:153`) so state resets on close; nothing in the repo dispatches `open-chat`. Phase 1 must **add** the mechanism. The server seam already exists: `findOrCreateDirectConversation` (`lib/messages/direct-conversation.ts:13-42`) returns an id and does not redirect.

1. **`openDirectConversation(otherProfileId)`** — a new export in `app/(main)/messages/actions.ts` with the same self / block / friendship gates as `startConversation` but returning `{ ok: true, conversationId }` instead of redirecting. `startConversation` stays; five CRM redirects still use it. Copy: `You cannot message yourself.` · `You cannot message this member.` · `You need to be friends before you can message.` The `check:authz` guard token is satisfied by `getMyProfileId()` on the first line, exactly as `startConversation` does it.
2. **`lib/messages/dock-open.ts`** — a client-safe module with `openDockThread(ref)`, `openDockInbox()`, and two **pure, unit-testable** helpers `parseDockRequest(search)` and `stripDockParams(pathname, search)`. Two channels: a `CustomEvent` for in-page opens, and a `?chat=dm|room|inbox&thread=<id>` query param for full loads. The query channel must ship in this step **even though nothing uses it yet**, because it is how the retirement redirect (step 28) lands.
3. **The launcher.** ⚠️ `usePathname()` is called inline at `vera-launcher.tsx:45` (`usePathname().startsWith('/admin')`) and is never bound to a variable — the earlier draft's ":42 via `usePathname()`" reference was wrong and the variable does not exist. Bind `const pathname = usePathname()` **and** `const searchParams = useSearchParams()`, and key the deep-link effect on **both**. Keying on `pathname` alone means a query-only change never fires, so any `?chat=…` link or server redirect landing on the page the member is already on is silently ignored — reachable from step 28's redirect and from any future in-app link. ⚠️ `useSearchParams` requires a Suspense boundary for static routes; `VeraLauncher` is mounted in the `(main)` layout, so **confirm against `node_modules/next/dist/docs` before adopting**. If awkward, keep `window.location.search` but key the effect on `pathname + searchParams.toString()`. Use `window.history.replaceState` (plain DOM) to strip the params, not `router.replace`, which re-runs Server Components for a URL the page does not read.
4. **`DockChat` honours a request.** Add `requested?: DockOpenDetail | null` and `onRequestHandled?: () => void`, with a `handledRef` keyed on `requestId` so asking twice for the same thread re-opens it. Fall back to the server-computed title (`loadDockDmThread` returns one) when the caller did not know it.
5. **ESC semantics, specified rather than argued.** The earlier draft left this as prose that contradicted itself. Concretely: add `onThreadOpenChange?: (open: boolean) => void` to `DockChat`; call it from an effect on the open-thread state and with `false` on unmount. In the launcher hold `const [threadOpen, setThreadOpen] = useState(false)` and branch the existing handler at `:107`:

```ts
      if (e.key === 'Escape') {
        if (threadOpen) window.dispatchEvent(new Event('dock-chat-back'))
        else setOpen(false)
      }
```

   Add the focus-return ref in the same step (store `document.activeElement` on open, restore it in `close()` at `:118`), since both touch `close()`. Also add `aria-modal="false"` at `:153` — the dock is non-modal by design and `role="dialog"` alone makes assistive tech infer modality. Do **not** add a focus trap.
6. **`MessageMemberButton`** — one shared client component, three callers, **all in one commit** or they diverge: `components/people/connection-panel.tsx:95-101` (the `Reconnect with {firstName}` button the owner named), `app/(main)/people/[handle]/page.tsx:341-347` (the header `Message` chip), `components/circles/circle-members-list.tsx:113-123`. Remove the now-unused `startConversation` imports from the two client files. **Do not delete `startConversation` itself.**
7. **The dock's own dead button.** `dock-chat.tsx:112` links to `/messages/rooms`, which contains only `actions.ts` and no `page.tsx`. It 404s today, on the surface the owner wants to be the only chat surface. Repoint it, and fix two dock-only defects in the same commit: room unread is counted N+1 (one `count` query per room, `popover-actions.ts:90-100` — use the grouped `room_unread_counts` RPC the page already uses), and `MessagesSummary.rooms.visibility` omits `'channel'` so channel rooms flow through mis-typed (`popover-actions.ts:10`).

#### Gate A: DM routes retire

```ts
// Chat consolidation (ADR-896): when TRUE the full-page DM route redirects into the chat
// dock. Defaults FALSE on ANY read failure, so a transient DB hiccup can never make a
// member's messages unreachable. Flip the row back to false to restore the page, no deploy.
export const chatDmRoutesRetiredFlag = cache(async (): Promise<boolean> => { … })
```

`app/(main)/messages/[id]/page.tsx` gains one line at the top of the function: `if (await chatDmRoutesRetiredFlag()) redirect(\`/feed?chat=dm&thread=${id}\`)`. The launcher's `parseDockRequest` effect picks it up on the resulting load and opens the dock at that thread. Seed the flag `false` in a migration. ⚠️ **Confirm `platform_flags.key` is not CHECK-constrained** before writing it (`lib/platform-flags.ts:255-265` upserts with no visible constraint, but the reader is not the schema).

Client links that must be repointed in the same commit, because a link that visibly bounces is worse than a link that goes to the right place: `components/marketplace/listing-contact-dialog.tsx:135`, `components/widgets/events/host-person-credit.tsx:58`, `app/(main)/market/service-actions.ts:125` (which returns `{ url: '/messages/'+id }` and **breaks `app/(main)/market/service-actions.test.ts:90`** — update the assertion together).

#### Gate B: room routes — the honest blocker

Blocked on P2-1..P2-8 (uncap the inbox, in-dock room list + create, room settings, membership ops, in-room search, non-member join preview, presence dots, mobile behaviour). Free with it: delete `components/messages/messages-popover.tsx`, 166 lines with zero importers.

**This needs an owner decision, not an open-ended dependency.** See open question O1.

---

## 6. The build sequence

One numbered checklist across all four workstreams, in dependency order, one commit per step. **The header fix is steps 3-6, on day one.** Run `pnpm lint && pnpm exec tsc --noEmit && pnpm test` on every step — `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so `pnpm build` alone is a **false green**.

### Phase 0 — Ground the tree (before any code)

| # | Step | Risk | Verify |
|---|---|---|---|
| 1 | **Land or stash the uncommitted modified files.** 23 at the time of writing and **growing during this session** (`docs/DECISIONS.md` and `docs/THEME.md` joined mid-analysis). `app/globals.css`, `components/page-editor/blocks/profile.tsx` and `app/(main)/spaces/[slug]/(profile)/layout.tsx` are all in flight **and** all edited by this plan. Then re-anchor every CSS reference by searchable marker, not line number. | 🟢 | `git status --short` is clean for the files this plan touches |
| 2 | 🔴 **Claim ADR numbers, and resolve a live double-claim on 893.** `docs/EVENTS-SERIES-BUILD-PLAN.md` is committed on this branch and line 29 claims **ADR-893**, citing it from a code comment (`:460`) and a migration header (`:581`). **And an uncommitted change to `docs/DECISIONS.md` (working tree, alongside `docs/THEME.md`) has now appended a different ADR-893, "A Space theme is a treatment, not a family swap".** Two workstreams hold the same number right now. Settle that first, then take **ADR-894** header · **ADR-895** associations · **ADR-896** chat retirement. Replace the old check everywhere with `grep -rn 'ADR-89[0-9]' docs/ scripts/ lib/ app/ components/`, which finds claims in plan docs, code comments and migration headers, not just `DECISIONS.md`. | 🟡 | The grep returns exactly one owner per number, and no conflict for 894-896 |

### Phase 1 — The collision (day one; this is the owner's headline complaint)

| # | Step | Risk | Verify |
|---|---|---|---|
| 3 | **Edit 1 + close the circles leak.** Delete `hasSecondary`; flatten `viewerActions` to a fragment; add `secondaryActions`; swap `page.tsx:468` to `{editProfileButton ?? secondaryActions}`; `items-start` on `BlockButton`'s error wrapper; **delete the `{n} circles` band item and its deep link (`page.tsx:457-464`)**; filter the surviving `circlesResult` read (`:191`) by `unlisted = false` and the status allowlist so the `Circle Up` achievement cannot republish what the deletion protects. | 🟢 | `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm check:tokens && pnpm check:headers` |
| 4 | **`PageHero`: two lanes.** Container-query grid, `actionsLabel`, `initialZoneTones`, `ownsHeader`, `data-hero-zone` on **both** the identity and overlay branches, `data-hero-cover` on the cover `<Image>`, `leading` loses `shrink-0`. | 🟡 | `pnpm build` (confirm `@container` compiles), then eyeball `/people/<handle>` **and `/journeys/<slug>`** at 375 / 768 / **1024 / 1152 / 1279** / 1440 / 1680 |
| 5 | **Profile flattens and labels its actions slot.** `actionsLabel="Profile actions"`, `{isOwner ? ownerActions : viewerActions}` plus the QR chip as one fragment. | 🟢 | `pnpm lint && pnpm exec tsc --noEmit && pnpm test` |
| 6 | **Cover diet.** Add `BAND_ACTION_CLASS`; move `Save contact`, `Tip` and the staff `Settings` drawer into the band control row (5.2's `§ Band line 2` JSX, gated so an empty row renders nothing). | 🟡 owner-visible | `pnpm lint && pnpm exec tsc --noEmit && pnpm check:tokens`, eyeball as owner / visitor / staff / janitor |
| 7 | **Body order.** Delete `order-2` / `xl:order-1` (`:481`) and `order-1` / `xl:order-2` (`:567`); add a comment citing the rail arithmetic so nobody "fixes" it to `DetailTemplate.sidebar`. | 🟢 | `pnpm build`, eyeball 390 / 768 / 1280 |

> **◀ One-day cut line.** Steps 1-7 are 100% of the collision and need no contrast work. Stop here if that is the budget.

### Phase 2 — Contrast

| # | Step | Risk | Verify |
|---|---|---|---|
| 8 | **Pure maths in `lib/images/hero-contrast.ts`.** `resolveZoneTone` compositing in **sRGB** (re-derive the whole ladder), `HERO_PLATE_ALPHAS`, `rectToRegion`, `coverSourceRect`, and the split sampler `loadSampleSource` / `tileLuminancesFrom`. Deprecate but do not delete `sampleCoverRegionLuminance` and `HERO_TEXT_REGION`; keep `resolveMediaTone` and its tests as the regression net. | 🟢 additive | `pnpm test lib/images/hero-contrast.test.ts && pnpm exec tsc --noEmit` |
| 9 | 🔴 **CSS and sensor, ONE atomic commit.** The new CSS reads attributes only the new sensor writes; shipped apart, every profile pins to the unmeasured branch. Zone rules + plate `z-index: -1` + `srgb-linear` + halo-as-rung-1 + the retained section-level default; sensor rewritten for `data-hero-cover`, per-zone measurement, single decode, `ResizeObserver`, and the deleted wrong-answer fallback. Add a drift guard pairing `data-hero-zone` in `page-hero.tsx` with `dataset.mediaPlate` in `hero-adaptive-text.tsx` so they can never land apart again. | 🟠 | `pnpm check:tokens && pnpm build && pnpm test`. Devtools: both `[data-hero-zone]` elements carry `data-media-tone` and `data-media-plate`; **no request to `*.supabase.co` from the sensor**; the plate paints **behind** the name |
| 10 | **One on-cover chrome.** `.hero-chip` + `HERO_ACTION_CLASS_ADAPTIVE`; swap the three surviving profile call sites; `onMedia` on `FriendButton` only. | 🟡 | `pnpm test && pnpm check:tokens`; the seven non-profile `HERO_ACTION_CLASS` sites are byte-identical and `channels/[id]/page.test.ts:46` stays green unedited |
| 11 | **Telemetry.** One `Sentry.captureMessage`, once per page session, from the unmeasured branch, carrying `reason` and `host` (never the full URL). | 🟢 | With no `NEXT_PUBLIC_SENTRY_DSN`, confirm no network request |
| 12 | **Sanitize `header_image_url`.** `app/(main)/settings/profile/actions.ts:245-247` stores a pasted URL with no host check, unlike the avatar. Route it through the same sanitizer (allowing `next.config.ts` `images.remotePatterns` hosts plus site-relative paths); on rejection leave the stored value untouched. | 🟢 | `pnpm test && pnpm lint` |
| 13 | **A11y and kit hardening.** `aria-labelledby="page-hero-title"` on the hero `<section>`, `id="page-hero-title"` on the `h1`, `alt=""` for the hero avatar, `RoleBadge size="compact"` replacing four `!important` overrides, `text-white` → `text-on-primary` in `block-button.tsx:90`. | 🟢 | `pnpm test test/a11y/primitives.a11y.test.tsx`, then VoiceOver: the band appears in the landmark rotor and the name is announced once |

### Phase 3 — The body reads as finished

| # | Step | Risk | Verify |
|---|---|---|---|
| 14 | **Sidebar: five boxes to three `SidebarCard`s.** Achievements folded into Standing; drop the duplicate `Rank` row; `bg-warning-bg/60` → `bg-surface-elevated`; two `text-2xs` progress lines → `text-xs`; `ProfileAwards` → `SidebarCard`. | 🟡 | `pnpm test test/a11y/primitives.a11y.test.tsx && pnpm check:tokens`; confirm no overflow at 1280px |
| 15 | **Empty states E1-E3.** `ProfileFeed` gains `firstName`, derives `isOwner`, **imports `EmptyState`**; `ProfilePosts` owner description; `FrequencySignature` returns `null` for a visitor and gets a **compact** owner prompt (not a full `EmptyState`). | 🟢 | `pnpm exec tsc --noEmit && pnpm test`, then hand-run CONTENT-VOICE §10 on each string (`check:canon` does **not** scan `.tsx`) |
| 16 | **Achievements E4, owner-gated.** `hint` on `rewards`; `hint?: string` and `isOwner: boolean` on `AchievementChip`'s props; `hint={r.hint} isOwner={isOwner}` at the call site; `aria-label` replacing the unreliable `title`; `circle` → `Circle`. | 🟢 | `pnpm exec tsc --noEmit && pnpm test`; a render test asserts the visitor markup contains none of the four hint strings |
| 17 | 🆕 **The new-member floor.** Frequency Signature renders at zero as a constellation for visitors of members under 30 days; the composer's empty timeline carries `Joined {month}. Say hello.` for a signed-in visitor. | 🟡 owner-visible | Eyeball as a stranger on a 3-day-old test account. **This screen is an owner sign-off gate.** |
| 18 | **Performance P1-P7.** Parallelize the profile row with `getUser`; fold `resolveHeaderElement` into the existing `Promise.all`; add `PanelSkeleton` on the `Skeleton` primitive; wrap `ConnectionPanel` and `MemberSupportPanel`; replace `fallback={null}`; rebuild `ProfileFeedSkeleton` on the primitive. | 🟡 | `pnpm exec tsc --noEmit && pnpm test && pnpm build`; confirm the hero paints before the connection card streams in |

### Phase 4 — Associations

| # | Step | Risk | Verify |
|---|---|---|---|
| 19 | **Data layer, tier A, five kinds** (no Events). `lib/people/associations.ts`: pure assembler, `safeRead`, `cache()` wrapper, five query chains with **four** `.is('space_id', null)` and journeys' `.eq('status','approved')`. | 🟡 | `pnpm exec tsc --noEmit && pnpm test && pnpm check:authz && pnpm check:rls && pnpm check:vocab` |
| 20 | **The panel**, with tiers B and C. `components/profile/profile-associations.tsx` mounted first in the content column behind `<Suspense fallback={<PanelSkeleton className="h-40" />}>`. | 🟡 owner-visible | `pnpm check:tokens && pnpm check:headers`, eyeball at 390 / 768 / 1280 as visitor / friend / owner / janitor |
| 21 | **Events tile. 🔴 BLOCKED on `lib/events/series.ts`.** Sixth read, `collapseSeries` before counting, `approximate` at the 50-row ceiling, tile `href` → `/discover/events/organizer/{handle}`. | 🟡 | Confirm a weekly series renders as **one** Event, not twelve |
| 22 | **Tests.** Pure assembler; the **privacy drift guard** (source-shape, asserting four `.is('space_id', null)` occurrences, the status allowlists, the forbidden-table list, and that the reader signature takes no viewer argument); render tests asserting a friend's markup is **byte-identical** to a stranger's for tier A; a11y. | 🟢 | `pnpm test` — **and confirm each assertion FAILS against the pre-step-19 tree** (`lib/meta-scan-highs.test.ts:6-7` sets this bar) |
| 23 | **Docs.** New `docs/PROFILE-ASSOCIATIONS.md` carrying the visibility contract verbatim; **ADR-895**; update the Notion profile/moderation subject page in place. | 🟢 | `pnpm check:canon && pnpm check:seo` |

### Phase 5 — Messaging

| # | Step | Risk | Verify |
|---|---|---|---|
| 24 | `openDirectConversation` + `lib/messages/dock-open.ts` (with the pure `parseDockRequest` / `stripDockParams`). | 🟢 | `pnpm check:authz && pnpm test` |
| 25 | Launcher + `DockChat`: `requested` / `onRequestHandled` / `onThreadOpenChange`, the `pathname + searchParams` deep-link effect, ESC back-then-close, focus to the composer on a programmatic open, focus return on close, `aria-modal="false"`. | 🟡 | `pnpm exec tsc --noEmit`; manual Q1-Q10 |
| 26 | **`MessageMemberButton`, three callers, one commit.** `connection-panel.tsx:95-101` (the owner's `Reconnect`), `page.tsx` header `Message`, `circle-members-list.tsx:113-123`. Plus the drift guard asserting none of the three contains `startConversation.bind`. | 🟡 | `pnpm test && pnpm check:tokens && pnpm check:crm-parity` |
| 27 | Dock hygiene: the `/messages/rooms` 404, the room-unread N+1, the `'channel'` visibility union. | 🟢 | `pnpm exec tsc --noEmit && pnpm test` |
| 28 | 🚩 **Gate A: DM routes retire.** `chat_dm_routes_retired` flag + migration + operator toggle (`Chat in the dock only`); the one-line gate on `app/(main)/messages/[id]/page.tsx`; repoint the three client links; **ADR-896**; add the `chat dock` row to `docs/NAMING.md`. Ship the flag **off**, flip for staff first. | 🟡 | `pnpm test && pnpm check:seo`; Q11-Q14 with the flag on and off |
| 29 | 🔴 **Gate B: room routes.** Blocked on the 8-item port. **Do not start without an answer to O1.** | 🔴 | — |

### Phase 6 — Later, own PRs

| # | Step | Risk |
|---|---|---|
| 30 | Server-seeded first-paint tone: `lib/profile/header-tone.ts` (read/write over the existing `profiles.meta` jsonb bag, **no migration**), keyed on a fingerprint of `${imageUrl}|${focus}|${overlayStyle}` so a new photo invalidates it; computed at set time in `profile-form.tsx`; self-healed by `cacheOwnHeaderTone` on the owner's own view via the `ownsHeader` prop threaded in step 4. | 🟠 |
| 31 | Opt Journeys, then Circles, then Channels into `adaptiveText`, one commit each. Spaces is a hand-rolled cover, not `PageHero`; leave it. | 🟠 |
| 32 | `check:tokens` raw-palette rule (`border-white/40`, `bg-black/30`, `text-white`) — **sweep first, then the rule**, two commits in one PR. | 🟠 |
| 33 | `getMemberProfileModules` stops re-reading the profiles row twice; named z-index ladder; resolve the `/profile` rail href; move `UnderlineTabs` out of `components/admin/`. | 🟡 |
| 34 | Member help + changelog + the Notion "The member profile" page (copy below). | 🟢 |

**Full gate before opening any PR:**

```
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build && \
pnpm check:authz && pnpm check:canon && pnpm check:menu && pnpm check:elements && \
pnpm check:tokens && pnpm check:headers && pnpm check:seo && pnpm check:collective && \
pnpm check:crm-parity && pnpm check:vocab && pnpm check:rls && pnpm check:migrations
```

---

## 7. Verification

### 7.1 Visual QA: the fixture matrix

**Method.** Upload each fixture through `/settings/profile` on a staging account so the real pipeline runs (upload to the `avatars` bucket → `getPublicUrl` → `next/image`). **Do not shortcut with a local file URL**; that skips the exact path the sensor reads.

**8 covers × 6 widths (375 / 768 / 1024 / 1152 / 1279 / 1440) × 2 themes.** The 1024-1279 band is mandatory: it is where the rail mounts and where a viewport-keyed grid would have re-created the collision.

| # | Fixture | What it stresses | Must be true |
|---|---|---|---|
| V1 | Flat white | The light extreme | Dark copy on name, `@handle`, eyebrow **and every chip**. Rung 0, no visible treatment |
| V2 | Flat black | The dark extreme | Light copy everywhere. Rung 0 |
| V3 | Flat mid grey at the crossover (~45% grey, L ≈ 0.176) | The luminance where neither tone wins | A treatment **must** appear. Neither tone alone may ship here |
| V4 | Hard 50/50 split, white left, near-black right | Two zones over opposite backdrops | Each zone independently readable. **If the zones resolve to different tones, the owner must accept that look** (open question O2). Per the "one treatment" rule, both zones step to the higher rung |
| V5 | **The real cover:** bright subject in a white coat on mid-tone timber | The reported bug | Name, `@handle`, role badge and every chip legible. **No element overlaps another at any of the six widths.** Confirm the plate paints behind, not over, the name |
| V6 | No cover at all | The gradient placeholder path | Placeholder renders; copy legible; **the sensor must NOT sample the avatar** (check the network panel and `data-media-*` values); no console error |
| V7 | Very wide and short (3000×600) and very tall and narrow (800×2400) | Focal point + `coverSourceRect` | The focal point is respected; the sampled region tracks what is visible |
| V8 | A third-party host URL | The taint path + telemetry | Copy falls back to the halo with **no plate**, never white-on-mid-tone. One Sentry warning with `reason: 'tainted'`. After step 12 this input is rejected at save time instead |
| **V9** | 🆕 **Stranger viewing a 3-day-old member** | The new-member floor | The page has substance: a constellation, an invitation, or a Circle in common. **Owner sign-off gate.** |

**Per-cell pass criteria (all four):**
1. No on-cover element overlaps or shares an optical line with another.
2. Name, `@handle`, role badge and every chip read clearly. Check the worst with a browser contrast picker; target 4.5:1.
3. Every chip has the same chrome. No amber block, no cream block, no page-canvas border on the photo.
4. First paint is not the wrong tone for more than one frame, or if it is, the treatment is already visible.

**Plus once per pass:** tab through the whole header and confirm the focus ring is visible over the photo and travels in visual order (today the QR chip renders between two action rows, so the ring jumps down and back up). And at 375px, **the cover must not grow past 240px**.

### 7.2 Test matrix

| Layer | What it proves | File | Command |
|---|---|---|---|
| Pure contrast maths | `resolveZoneTone` picks the right tone and the **smallest** rung that clears 4.5:1, composited in **sRGB**, for 13 tile fixtures including the owner's bimodal cover; never throws; never returns rung 0 when nothing clears | `lib/images/hero-contrast.test.ts` | `pnpm test lib/images/hero-contrast.test.ts` |
| 🆕 Colour-space anchor | The resolver's predicted composite luminance for one known pair equals a hand-computed sRGB blend. **This is the test that makes the linear-vs-sRGB error impossible to repeat.** | same | same |
| Geometry | `rectToRegion` clamps to `[0,1]`; `coverSourceRect` honours the focal point and returns `null` on degenerate input | same | same |
| Sampler seam | `tileLuminancesFrom` is pure over a fake `CanvasImageSource`; `loadSampleSource` resolves `null` in both node and jsdom (proving the failure path is **total**) | same | same |
| Fallback drift guard | The sensor no longer contains `overlayStyle === 'none' ? 'dark'`; it contains `currentSrc` and `data-hero-cover`; the sampler still returns `null` from its catch; the plate ladder is in step between CSS and TS | new `components/templates/hero-adaptive-text.test.ts` | `pnpm test` |
| 🆕 Pairing guard | `page-hero.tsx` contains `data-hero-zone` **and** `hero-adaptive-text.tsx` contains `dataset.mediaPlate` — the two can never land apart | same | same |
| 🆕 Branch-coverage guard | Every branch of `page-hero.tsx` that renders `text-on-media` also renders a `data-hero-zone` under `adaptiveText` (catches the orphaned overlay variant) | same | same |
| Page shape drift guard | `page.tsx` no longer contains `flex flex-col items-end gap-2` in the actions slot, `hasSecondary`, `order-1`, or the `/circles/${circles[0]!.slug}` deep link; `HERO_ACTION_CLASS_ADAPTIVE` appears at the three swapped sites | new `app/(main)/people/[handle]/page.test.ts` | `pnpm test` |
| Associations visibility | **The only defence.** Four `.is('space_id', null)`, the status allowlists, `.eq('status','approved')` for journeys, the forbidden-table list, and a reader signature with no viewer argument | new `lib/people/associations.privacy.test.ts` | `pnpm test` |
| Associations render | A friend's markup for tier A is **byte-identical** to a stranger's; a janitor's too. Sameness is the only way to prove there is no viewer branch. | `components/profile/profile-associations.test.tsx` | `pnpm test` |
| Messaging | `parseDockRequest` / `stripDockParams` table (7 cases); the three callers use `MessageMemberButton`; `openDirectConversation` refuses self / blocked / non-friend | S4 files | `pnpm test` |
| a11y (structural only) | `PageHero` (identity + actions) and `SidebarCard` are axe-clean for **accessible names, alt text, ARIA validity and heading structure** | `test/a11y/primitives.a11y.test.tsx` | `pnpm test test/a11y/…` |
| Types | The only real typecheck | — | `pnpm exec tsc --noEmit` |
| Tokens | No hex / `rgb()` / `text-[Npx]`. ⚠️ Does **not** catch `border-white/40` until step 32 | `scripts/check-tokens.mjs` | `pnpm check:tokens` |
| Voice and naming | ⚠️ **Human only.** `check:canon` never scans `.tsx` | CONTENT-VOICE §10 by hand | — |

**🔴 Correcting a false promise about a11y coverage.** Earlier drafts claimed that adding `PageHero` to the axe suite would catch the unnamed hero landmark and the unlabelled action group, and that the case would **fail** before the fix. **It will not.** `test/a11y/axe.ts:20-28` explicitly disables `region`, `landmark-one-main`, `page-has-heading-one`, `html-has-lang`, `document-title` and `bypass` because a fragment is not a page — so an unnamed `<section>` produces zero violations. axe-core also ships no default rule requiring an accessible name on `role="group"`. Both cases would pass vacuously before and after, which the repo's own bar (`lib/meta-scan-highs.test.ts:6-7`) says proves nothing.

**So:** keep the axe case for what it **can** catch (the avatar `alt`, button accessible names, ARIA validity, heading structure) and say so in the test's prose block. Make the landmark and group-label work real with **source-shape drift guards**: assert `page-hero.tsx` contains `aria-labelledby="page-hero-title"`, `id="page-hero-title"` and `aria-label={actionsLabel`. State plainly in the PR body that the rotor behaviour itself is **manual QA only** (VoiceOver).

**What cannot be tested here, stated plainly.** Do not write a PR description claiming the tests prove the header is readable.

| Untestable | Why | What replaces it |
|---|---|---|
| Canvas sampling | `canvas` is not installed; jsdom's `getContext('2d')` returns `null` | The pure resolver tests, plus the fixture matrix |
| Rendered contrast on a real photo | axe's `color-contrast` rule is disabled (jsdom computes no paint) | The fixture matrix, eyeballed, with a browser contrast picker on the two worst covers |
| Canvas tainting / CORS | No live Supabase response in this sandbox | Made moot by same-origin `/_next/image` sampling. Settle it for telemetry with one `curl -sI -H 'Origin: <site>' <cover url> \| grep -i access-control-allow-origin` |
| First-paint flash timing | No E2E harness | Devtools throttled to Slow 4G, filmstrip, look at frame 1 |
| The dock opening at a named thread; mobile sheet height; keyboard behaviour; redirect chains | No E2E harness, and `@testing-library/react` is not a dependency | The manual QA script, on a real iOS Safari and a real Android Chrome |
| Screen-reader rotor behaviour | axe's page-level rules are disabled in a fragment harness | VoiceOver / NVDA by hand |

### 7.3 A11y and mobile checklist

| # | Requirement | Where |
|---|---|---|
| A1 | Hero `<section>` has `aria-labelledby="page-hero-title"`; the `h1` carries that id | Step 13 |
| A2 | The on-cover action cluster is a `role="group"` with `aria-label={actionsLabel}` | Step 4 |
| A3 | The hero avatar is `alt=""` (decorative; it duplicates the `h1`) | Step 13 |
| A4 | Sidebar cards use real `<h3>`s; folded groups use `<h4>`. Heading order `h1 → h2 → h3 → h4` is real | Step 14 |
| A5 | Achievements never rely on colour alone: earned shows a star, unearned shows a visible text hint (owner) or nothing (visitor); `aria-label` replaces the unreliable `title` | Step 16 |
| A6 | `Act as` carries an explicit `aria-label`: `Act as {firstName}. Full control of this member's account.` | Step 3 |
| A7 | The dock is `role="dialog"` **plus `aria-modal="false"`**; no focus trap; focus moves to the composer on a programmatic open and returns to the opener on close; ESC goes back to the inbox before it closes | Step 25 |
| A8 | Every `<Suspense>` fallback reserves the height of what it replaces. No `fallback={null}` | Step 18 |
| M1 | 375px: the cover does **not** exceed 240px. Requires ≤ 3 chips, which requires the cover diet | Steps 4, 6 |
| M2 | 375px: actions right-aligned under the lockup, not left | Step 4 |
| M3 | 1024-1279px: the hero stays stacked (the rail leaves ~388px) | Step 4 |
| M4 | Phone: the dock rises to ~92dvh when opened **at a thread**; `overscroll-contain` on the message list so a rubber-band does not scroll the page behind | Step 25 |
| M5 | Phone: the OS back button leaves the page with the dock open. **Documented, not hacked** — a history-entry hack in a non-modal dock is a reliable source of double-back bugs | Step 25 |
| M6 | Keyboard-only: tab to the dock edge pill, Enter, tab through the inbox, Enter on a row. Every control reachable and visibly focused; Tab must be able to **leave** the dock | Step 25 |

### 7.4 Manual QA script (messaging)

Run every row on desktop (1440px) and on a real phone.

| # | Steps | Pass |
|---|---|---|
| Q1 | Friend's profile → header `Message` | Dock opens bottom-right at that thread; **no navigation**; URL unchanged |
| Q2 | Same profile → `Reconnect with <name>` | Same, and the profile stays scrolled where it was |
| Q3 | Circle → hover a member row → message icon | Same, correct member |
| Q4 | `Message` a non-friend | Inline `You need to be friends before you can message.`; dock does not open |
| Q5 | Block, then `Message` | Inline `You cannot message this member.` |
| Q6 | Dock open at thread A → `Message` a different member | Switches to B; does not stack; does not stay on A |
| Q7 | Open at A, close, click the same `Message` again | Reopens at A (the `requestId` nonce re-fires) |
| Q8 | Dock open at a thread → ESC | Back to inbox. ESC again → closes, focus returns to the opener |
| Q9 | Phone: tap `Reconnect` | Sheet rises to ~92dvh; composer visible; keyboard does not hide the last message; the page behind does not rubber-band |
| Q10 | Phone: OS back with the dock open | Documented behaviour; no broken half-state |
| Q11 | **Gate A on:** paste `/messages/<a real conversation id>` cold | Lands on `/feed`, dock opens at that DM, URL cleaned |
| Q12 | **Gate A on:** the iOS universal link path from an external referrer | Redirects; no 404; no auth loop |
| Q13 | **Gate A off again**, reload the DM URL | The old page renders. **No deploy.** |
| Q14 | Screen reader: open the dock | Announced as a dialog, **not modal** |

### 7.5 Risk register

| # | Risk | Likelihood | Impact | Mitigation | Step |
|---|---|---|---|---|---|
| K1 | Contrast regions get calibrated against a layout that is about to change | high | med | **Layout ships before sampling, by design** | Phase 1 before 2 |
| K2 | 🔴 CSS and sensor land apart, pinning every profile to the unmeasured branch | med | **high** | One atomic commit + a pairing drift guard | 9 |
| K3 | 🔴 The plate paints **over** the name (CSS painting order) | high if unguarded | **high** | `z-index: -1`, verified in devtools on V5 before merge | 9 |
| K4 | 🔴 The plate ladder is re-derived wrong again (colour space) | med | high | `srgb-linear` in CSS + a unit test anchoring predicted composite luminance to a hand-computed blend | 8, 9 |
| K5 | 🔴 The grid re-creates the collision between 1024 and 1279 | high if viewport-keyed | high | Container query, capped actions track, `leading` loses `shrink-0`, and 1024 / 1152 / 1279 are mandatory QA cells | 4 |
| K6 | 🔴 The sensor samples the **avatar** on profiles with no cover | certain if unguarded | high | Gate on the `coverImage` prop **and** scope to `img[data-hero-cover]` | 9 |
| K7 | 🔴 A Circle inside a Private Space is named and deep-linked to strangers | med | **high** | Four `.is('space_id', null)`, a guard asserting four occurrences, and a manual privacy read on five real profiles gates the phase | 19, 22 |
| K8 | A moderation-**rejected** Journey is listed on a profile | med | high | `.eq('status','approved')`, matched to `/journeys`'s own filter | 19 |
| K9 | The `Circle Up` achievement republishes the membership bit the band deletion protects | high if unguarded | med | Filter `circlesResult` in the same commit as the deletion | 3 |
| K10 | Achievement hints render on other people's profiles | certain if unguarded | med | `isOwner` branch + a render test asserting the four hint strings are absent | 16 |
| K11 | The page ends up **shorter and emptier** for a new member | high | high | The new-member floor + V9 as an owner sign-off gate | 17 |
| K12 | ADR numbers collide with a parallel workstream | **certain, already happened** | low | ADR-893 is claimed **twice** right now: by the committed `docs/EVENTS-SERIES-BUILD-PLAN.md` and by an uncommitted `docs/DECISIONS.md` entry. Stated fact, not a hypothetical. Repo-wide grep, not a `DECISIONS.md` grep, and resolve 893 before taking 894 | 2 |
| K13 | An edit lands on the wrong lines because the tree is dirty and CSS references drift | high | med | Ground the tree first; anchor every CSS edit to a searchable marker | 1 |
| K14 | A regression to hardcoded on-cover tones passes CI silently | high | med | Drift guards now; the `check:tokens` palette rule later | 9, 32 |
| K15 | `pnpm build` gives a false green (`typescript.ignoreBuildErrors: true`) | high | med | Every step leads with `pnpm exec tsc --noEmit` | all |
| K16 | New UI copy violates CONTENT-VOICE because `check:canon` never scans `.tsx` | high | med | An explicit human §10 pass is a **named step** in every phase that adds a string | 15, 16, 20 |
| K17 | Retiring the DM route strands the market service action's `{ url }` return | certain | med | Repoint it and update `service-actions.test.ts:90` in the same commit | 28 |
| K18 | A future DAWN sync drops `--color-on-media*` and the plate ladder | low | med | `design_handoff/colors.css` has **no** `--color-on-media*` rows. Repo-owned comment blocks in `app/globals.css`; ask the owner to add three token rows to DAWN | 2, 34 |
| K19 | `useSearchParams` needs a Suspense boundary the `(main)` layout does not provide | med | low | Confirm against the Next docs before adopting; fall back to `window.location.search` keyed on `pathname + searchParams.toString()` | 25 |
| K20 | `@container` does not compile in this Tailwind setup | low | med | Verify in step 4 with `pnpm build` and inspect the emitted CSS; fall back to `2xl:grid` | 4 |

### 7.6 Open questions that need the owner

| # | Question | Recommendation | Gates |
|---|---|---|---|
| **O1** | 🔴 **Does "all chats happen in the pop up" include room administration** (rename, delete, invite, promote, remove, in-room search), or only conversations? This is the single biggest cost driver in the whole plan. | **Split it.** Port the conversation-shaped capabilities (uncapped inbox, in-dock room list and create, in-room search, join preview) into the dock, and move room *administration* to the existing admin surfaces rather than into a 24rem popover, which is a poor host for a member-management console. Then retire the room routes. That is a smaller, better-shaped port than "everything into the popup". **Needs a date, not an open dependency.** | Step 29 |
| **O2** | 🔴 **Do you want the two hero zones to be allowed DIFFERENT tones** on a split cover (name dark, buttons light)? It is what "always choose the best contrasting color" means literally, and it can read as inconsistent. | This plan already applies the "both zones step to the higher plate rung" rule so the *treatment* is uniform. Whether the *tones* may differ is a look call. Show fixture V4. If you want one tone, it is a one-line change in the sensor (run the resolver over the union of both zones' tiles); the pure maths is unaffected. | Phase 2 sign-off |
| **O3** | 🔴 **How far does "everything they are associated with" go?** The literal ask cannot ship: every membership table is owner-private by RLS, and the page reads through a client that bypasses RLS, so a count leaks as surely as a list. Tier A (built) is public-safe. Tier B (Circles in common) is safe. **Tier C** is owner-only. Everything beyond that (who else is in your Circles, what events you are attending, which Spaces you hold a seat in) is a product loosening. | Ship A + B + C. Do **not** loosen further without its own ADR. If you want more, the defensible next step is co-hosted Events, which RLS already makes as visible as the event itself. | Step 20 |
| **O4** | ⚠️ Do the plate alphas read as a bar on a clean photo? Contrast-correct is not the same as good-looking, and the corrected sRGB maths means a genuinely bimodal cover **will** get a visible plate. | Your eyes on your real cover, at rung 2 and rung 3. If a plate is unacceptable at any strength, the fallback is the halo alone, which means accepting that some covers are marginal. | Phase 2 sign-off |
| **O5** | ⚠️ Should the left-rail and footer `Message Boards` rows be repointed or removed? Removing makes the dock's edge pill the only entry, which is closest to the directive but is a visible nav change. | Repoint in Gate A, and rename. A member cannot map "Message Boards" onto "the dock" unaided. | Step 28 |
| **O6** | ⚠️ Do you want `Tip` and the staff `Settings` drawer off the cover at all? You named only `Block` and `Act as`. | Yes, and it is a **prerequisite**, not a nicety: the 375px height budget only works at three chips or fewer. If you say no, the cover grows on every phone and the contrast problem stays larger. | Step 6 |
| **O7** | ⚠️ The stronger option: **all** controls off the cover, so the header is pure identity (avatar, badge, name, handle). | Not the default here only because you asked for the Space-page treatment, which keeps actions on the cover. It is the cleanest possible answer to "cleaner and more inviting" and it deletes the whole class of bug. One line to adopt. | Step 6 |
| **O8** | ⚠️ Three docs claim the chat story: `docs/MESSAGING-PLATFORM.md`, `docs/CHAT-CONSOLIDATION-PLAN.md`, `docs/CHAT-SHELL-PLAN.md`. And `CHAT-SHELL-PLAN.md:105` says explicitly "both stay", which Gate A reverses. | Keep one, replace the other two bodies with a pointer. The reversal needs ADR-896, which step 28 writes. | Step 28 |

### 7.7 Member-facing copy (voice-checked)

**`docs/CHANGELOG.md`, under `## [Unreleased]` → `### Changed`:**

> `- **A clearer profile header**: your name and handle no longer sit under the buttons, and Frequency now picks the text color that stands out against the part of the photo they sit on. Fewer buttons ride the photo now, so the picture stays a picture.`

Earlier draft rejected. "Your profile header reads clearly on **any** cover photo" fails the skeptic test against this plan's own test case A12, which documents that some tile sets clear nothing. Do not make a promise the maths knows is untrue, in the one artifact members read. And the repo uses US spelling throughout (`content/help` contains "color", zero instances of "colour").

**`content/help/getting-started/your-settings.md`, new section** (no GFM tables; remark-gfm is not installed under `content/help/**`):

> `## What makes a good cover photo?`
>
> `Two things help most. Leave the lower left a little quiet, because that is where your name and handle sit. And pick a photo at least 1600 pixels wide so it stays sharp on a large screen.`
>
> `Beyond that, most photos work. Frequency reads the part of the picture your name sits on and picks the text color that stands out against it, and adds a soft backdrop behind the words when that part of the photo is busy.`

Leads with the two concrete asks. The earlier draft's "Any photo works" followed by "Two things still help" was a soft contradiction.

**Notion, new page "The member profile"** (Type: Operator guide · Source of truth: `docs/PAGE-FRAMEWORK.md` + ADR-894). Instructional voice, native blocks, no code, no changelog. Cover: what a visitor sees versus what the member sees, where `Block` and `Act as` live now and who sees them, what the associations panel does and does not reveal about someone (the three tiers in plain language, because that is the question a moderator will actually ask), and how to help a member whose cover photo reads badly. **The contrast algorithm does not go in Notion**; link to `docs/HERO-CONTRAST.md`. Also update **Role & Permissions** (`36bfb0d4-b941-8123-91af-eb04523b9f23`) in place: one paragraph saying `Act as` now lives on the join-date line under the cover.

---

## 8. Adjudicated

Every defect raised by the two adversarial reviews, and what this plan did with it. **36 raised, 36 applied, 0 overruled.** Every claim in this table was independently re-verified against the tree before being accepted.

| # | Sev | Defect | Disposition | Where in this plan |
|---|---|---|---|---|
| 1 | 🔴 | `.hero-zone::before` plate had no `z-index`; CSS painting order puts positioned descendants **above** in-flow content, so the ink wash and blur land on the name | ✅ Applied. `z-index: -1` with a load-bearing comment; devtools verification on V5 is a merge gate | 5.1.3, K3 |
| 2 | 🔴 | Circles read had no `space_id` filter, though `circles_space_visible` is in the same restrictive set; the page bypasses RLS. Test P6 hard-coded "three occurrences" | ✅ Applied. Verified `20260711090000:53-71` covers five tables. **Four** `.is('space_id', null)`; the guard asserts four; the check is mechanical | 5.3, step 19, K7 |
| 3 | 🔴 | `lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)]` re-creates the collision at 1024-1279 because the 288px rail leaves ~388px and the `shrink-0` avatar overflows | ✅ Applied. Container query, not a viewport breakpoint; capped actions track; `leading` loses `shrink-0`; 1024/1152/1279 are mandatory QA cells | 5.1.1, step 4, K5 |
| 4 | 🔴 | `el.querySelector('img')` returns the **avatar** on profiles with no cover | ✅ Applied. Gate on the `coverImage` prop **and** scope to `img[data-hero-cover]` | 5.1.4, V6, K6 |
| 5 | 🔴 | Owner ask 2 answered only for the button; the instruction deferred behind an open-ended port | ✅ Applied. Two flippable gates. **Gate A (DMs) ships this sprint**, with a parity row saying why. Gate B gets a named decision, O1 | 3.2, steps 28-29, O1 |
| 6 | 🔴 | Owner ask 3 narrowed to created-by; the first commit deleted the only association shown today | ✅ Applied. Three tiers (built / in common / your own picture); the deleted line is **replaced**; the narrowing decision goes to the owner as O3 | 3.3, 5.3, O3 |
| 7 | 🔴 | Plate maths modelled in linear light; browsers composite `color-mix(in srgb)` in gamma-encoded sRGB. Every rung-1 verdict wrong by ~4× | ✅ Applied. Re-verified independently (25% cream over black: model 4.70:1, renders 1.72:1). CSS moves to `srgb-linear`; the ladder is re-derived; rung 1 becomes the halo; the "rarely past step 1" claim is struck; a colour-space anchor test is added | 5.1.2, 7.2, K4 |
| 8 | 🔴 | The unmeasured rule kept the **light** default plus a 25% plate — light-on-light at ~1.13:1, the reported bug wearing a plate | ✅ Applied. Option (b): unmeasured renders the shipped halo at full strength and **no plate**. Test asserts it clears the floor against white and black | 5.1.2, 5.1.3 |
| 9 | 🔴 | The one-day cut list shipped the per-zone CSS **without** the sensor that stamps the zones | ✅ Applied. Steps 8 and 9 are one atomic commit with a pairing drift guard; the cut line moves to steps 1-7 (layout only) | 4, step 9, K2 |
| 10 | ⚠️ | Diagnosis row 4 blamed the fallback branch; the cited file sets `mediaScrim = 'on'` in the same branch, so a failure produces a **visible scrim**, not the scrim-less screenshot | ✅ Applied. Verified `hero-adaptive-text.tsx:91-93`. Row 4 rewritten as a latent path; the mean statistic and the collision are promoted to the two causes that explain the screenshot | 1, causes 1-4 |
| 11 | ⚠️ | Deleting the section-level rule orphans the `overlay` variant, which the profile can render because `page.tsx:423` passes `variant={header.layout}` and an operator value wins | ✅ Applied. Verified `lib/elements/header.ts:87`. Section rule **kept** as default; zones emitted in the overlay branch too; `legible` falls back to `on-image-text`; a branch-coverage guard added | 5.1.1, 7.2 |
| 12 | ⚠️ | Every `app/globals.css` line reference in Section 1 was off by ~130 lines; "replace 1288-1327" would delete the scroll-reveal and marquee blocks | ✅ Applied. Verified: `.hero-adaptive-text` 1415-1450, tokens 53-57, `@theme inline` 878, `.rank-badge` 1189-**1207**, `.reveal` at 1288. Every edit re-anchored to a searchable marker | 5.1.3, step 1 |
| 13 | ⚠️ | 22 uncommitted files including `app/globals.css` mean any line reference will drift again | ✅ Applied. Step 1 grounds the tree before any code | Step 1, K13 |
| 14 | ⚠️ | Promised a11y coverage is vacuous: `test/a11y/axe.ts` disables `region`, and axe has no `role="group"` name rule | ✅ Applied. Verified `axe.ts:20-28`. The claim is retracted; source-shape guards replace it; the rotor check is labelled manual-QA-only | 7.2 |
| 15 | ⚠️ | Journeys read had no status filter; a **rejected** plan keeps `published_at` and `visibility='public'` | ✅ Applied. Verified `20260605120000:47`. `.eq('status','approved')`, in the guard, matched to `/journeys` | 5.3, step 19, K8 |
| 16 | ⚠️ | Two sections gave contradictory instructions for the same JSX (keep vs delete the circles item) | ✅ Applied. Resolved in favour of deletion (the RLS reading is correct), moved into **step 3** so it ships with Edit 1 rather than waiting on the associations PR | Step 3 |
| 17 | ⚠️ | `ownsHeader` was named in one sub-step and added to no props type, so the self-heal never fires | ✅ Applied. Added to `PageHeroProps`, threaded to the sensor, `ownsHeader={isOwner}` from `page.tsx:433`; the `check:authz` reasoning is recorded | 5.1.1, 5.1.4, step 30 |
| 18 | ⚠️ | ADR-893 is already claimed by the committed `docs/EVENTS-SERIES-BUILD-PLAN.md`, and the prescribed `DECISIONS.md` grep would hand the collision through | ✅ Applied, and the critique **understated it**. Verified (line 29, plus `:460`, `:581`) — and during this session a *second* ADR-893 appeared in the working tree's uncommitted `docs/DECISIONS.md` (a Space-theme decision). Two live claims on one number, which is exactly what the `DECISIONS.md`-only grep was blind to. Re-allocated to 894/895/896; the check becomes a repo-wide grep; step 2 now resolves the double-claim first | Step 2, K12 |
| 19 | ⚠️ | `TipButton` / `ProfileSettingsDrawer` got new props in one section and were moved off the cover in another. One is dead work | ✅ Applied. **The cover diet is in**, so both keep their classes and need **no edit**. Only `FriendButton` gets `onMedia`. Stated as an explicit dependency | 5.1.5 |
| 20 | ⚠️ | Mobile header specs were incompatible (right-aligned inside the cover vs left-aligned stacked), and nobody analysed the 240px height budget | ✅ Applied. Settled: `flex flex-col items-end gap-3` below the breakpoint. Height budget derived (~222px at 375px with three chips), making the cover diet a **prerequisite**. "375px, the cover does not grow" is an acceptance row | 5.1.1, M1, O6 |
| 21 | ⚠️ | "Band line 2" was named in four places and specified in none | ✅ Applied. Exact JSX, placement, gating (empty renders nothing), and an honest note on the three-chrome tradeoff | 5.2 |
| 22 | ⚠️ | The uniform "render nothing when empty" answer makes a new member's page **shorter** than today; no spec described what a visitor should see | ✅ Applied. New section: the new-member floor, three specified regions, plus fixture **V9** as an owner sign-off gate | 5.2, step 17, K11, V9 |
| 23 | ⚠️ | `AchievementChip` renders unconditionally, so imperative second-person hints show to **visitors** | ✅ Applied. Verified `page.tsx:599-603`. Owner-gated; visitor sees label only; render test asserts the hint strings are absent | 5.2 E4, step 16, K10 |
| 24 | ⚠️ | The `circlesResult` read kept for `Circle Up` republishes the exact bit the band deletion protects | ✅ Applied. Filter it the same way, in the same commit; the reasoning goes in the guard | Step 3, K9 |
| 25 | ⚠️ | `EmptyState` is `px-6 py-12` with an `mx-auto max-w-sm` description — a ~260px block dropped into a 205px column | ✅ Applied. Verified `empty-state.tsx:38-48`. Compact two-line treatment instead; copy settled to `Your signature fills in across the four Pillars (Mind, Body, Spirit, Expression) as you log Practices.` | 5.2 E3 |
| 26 | ⚠️ | The launcher effect keyed on a `pathname` variable that does not exist, and a query-only change would never fire | ✅ Applied. Verified `vera-launcher.tsx:45` calls `usePathname()` inline. Bind both `pathname` and `searchParams`; the Suspense caveat is flagged as needing doc verification | 5.4, K19 |
| 27 | ⚠️ | The ESC step was unresolved prose that argued with itself | ✅ Applied. Specified: `onThreadOpenChange` callback, launcher `threadOpen` state, the exact branch, and the focus-return ref in the same step | 5.4 |
| 28 | ⚠️ | The `ProfileFeed` empty-state rewrite used `EmptyState` in a file that imports neither it nor anything from `components/ui` | ✅ Applied. Verified the imports. The import is now part of the step; `frequency-signature.tsx` checked too (`profile-posts.tsx` already has it) | 5.2 E1, step 15 |
| 29 | ⚠️ | The responsive table described the **current** flex row while another section replaced it, and named the wrong cross-section | ✅ Applied. Table rewritten to the actual post-fix geometry at every breakpoint; all cross-references corrected | 5.2 |
| 30 | ⚠️ | Two `new window.Image()` + `decode()` per run, multiplied by a resize observer | ✅ Applied. Split into `loadSampleSource` / `tileLuminancesFrom`, decode once, cache across re-runs keyed on `src`. Also gives the pure half a testable seam | 5.1.4, 7.2 |
| 31 | ⚠️ | Changelog claimed "reads clearly on **any** cover photo", which the plan's own A12 case says is untrue; "colour" is British where the repo is US | ✅ Applied. Rewritten to a mechanism; both spellings corrected; the help section leads with the two concrete asks instead of a soft contradiction | 7.7 |
| 32 | ⚠️ | "Classifieds post" violates `docs/NAMING.md:433-434`, which defines the qualified form as **Classifieds listing** | ✅ Applied. Verified. Also fixed the Spaces detail (`Owner` → `Running`, parallel with its siblings) and the section title (`has built` → `runs`) | 5.3 |
| 33 | ⚠️ | The operator toggle introduced "popup" as a second name for the dock | ✅ Applied. `Chat in the dock only`; a `docs/NAMING.md` row is part of the work; `Message Boards` is reconciled | 3.2, step 28, O5 |
| 34 | ⚠️ | Cross-references were wrong in both directions, and the new module had two different paths | ✅ Applied. One module path (`lib/people/associations.ts`); region order corrected to the live DOM (`PrivateContactPanel` before `ConnectionPanel`); this single document removes the cross-reference surface entirely | 5.2, 5.3 |
| 35 | ⚠️ | `hint` was consumed but never added to the props type or the call site, so the "low risk" commit does not compile | ✅ Applied. Full diff specified: `hint?: string` and `isOwner: boolean` on the props, both passed at `page.tsx:601` | 5.2 E4, step 16 |
| 36 | ⚠️ | Two unspecified plate consequences: a rounded rectangle behind a **round** avatar, and up to **two** plates on one photo when only one was flagged for sign-off | ✅ Applied. `leading` is excluded from the plated zone (which also tightens the sampled region); the "both zones step to the higher rung" rule is stated; both go into V4's per-cell criteria | 5.1.3, V4, O2 |

---

## Appendix: what was verified in the tree for this plan

Not assumed. Each was read before being relied on.

| Claim | Where |
|---|---|
| The collision markup exists as described | `components/templates/page-hero.tsx:173-192`; `app/(main)/people/[handle]/page.tsx:330-386,438-443` |
| `--color-on-media` is consumed at exactly two render sites | `page-hero.tsx:132-133`; `HERO_ACTION_CLASS` at `:88` is hardcoded `border-white/40 bg-white/10 text-on-ink` |
| The fallback branch sets `mediaScrim = 'on'`, so it is **not** the screenshot | `components/templates/hero-adaptive-text.tsx:91-93`; `app/globals.css:1444-1446` |
| The sensor stamps the `<section>`, not any zone | `hero-adaptive-text.tsx:103` |
| `--color-on-media` defaults to the **light** option | `app/globals.css:57` |
| Current `app/globals.css` anchors | tokens 53-57 · `@theme inline` 878 · `.rank-badge`+`.rank-dot` 1189-1207 · `.hero-adaptive-text` 1415-1450 · `.reveal` 1288 |
| `circles_space_visible` is a restrictive policy in the same five-table set | `supabase/migrations/20260711090000_space_content_isolation.sql:53-71` |
| `circles.space_id` exists | `lib/database.types.ts` |
| `journey_plans.status` is `draft \| pending \| approved \| rejected` | `supabase/migrations/20260605120000_community_library.sql:47` |
| Committed `DECISIONS.md` tops out at **ADR-892**; **ADR-893 is claimed twice** — by a committed plan doc and by an uncommitted `DECISIONS.md` entry that appeared mid-session | `docs/DECISIONS.md:15887` (HEAD) and its working-tree diff; `docs/EVENTS-SERIES-BUILD-PLAN.md:29,460,581` |
| The a11y harness disables `region` and five other page-level rules | `test/a11y/axe.ts:20-28` |
| `EmptyState` is `px-6 py-12 text-center` with `mx-auto max-w-sm` | `components/ui/empty-state.tsx:38-48` |
| `AchievementChip` renders with no `isOwner` branch | `app/(main)/people/[handle]/page.tsx:599-603` |
| `usePathname()` is called inline and bound to nothing | `components/vera/vera-launcher.tsx:45` |
| ESC closes the whole panel today | `vera-launcher.tsx:105-114` |
| The profile's hero variant comes from an operator-overridable config | `page.tsx:423`; `lib/elements/header.ts:87` |
| `ProfileAvatar` is a `next/image` `<Image>` (so a bare `querySelector('img')` finds it) | `components/profile/profile-avatar.tsx:28-38` |
| The `{n} circles` band line reads unfiltered `memberships` and deep-links a lone circle | `page.tsx:191,457-464` |
| Rail widths for the 388px arithmetic | `components/layout/app-shell.tsx:1927,1936,2003` |
| `Message Boards` is the rail and footer label for `/messages` | `lib/nav/registry.ts:305`; `lib/nav-areas.ts:88` |
| `docs/NAMING.md` defines **Classifieds listing** | `docs/NAMING.md:433-434` |
| Tailwind v4, Next 16.2.12; no `@container` usage anywhere yet | `package.json:52,82`; grep of `app/globals.css` |
| `<Suspense>` streaming semantics | `node_modules/next/dist/docs/01-app/02-guides/streaming.md` |
| `next.config.ts` redirects are evaluated before the filesystem | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md` |

**Marked unverified and handled as such:** whether Supabase Storage returns `Access-Control-Allow-Origin` (made moot by same-origin sampling); whether `platform_flags.key` is CHECK-constrained (confirm before the migration); whether the `@container` variant compiles in this setup (verify in step 4); whether `useSearchParams` needs a boundary in the `(main)` layout (confirm against the Next docs); whether `/circles/new` exists (point at `/circles` if not); whether `{ count: 'exact' }` alongside a `.limit()` returns the full match count here (standard PostgREST behaviour, and the repo relies on it at `lib/practices.ts:326`, but assert it once against a real profile).
