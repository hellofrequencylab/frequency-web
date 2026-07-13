# Mobile navigation plan

> **Goal.** Keep the mobile app as clean as possible while making sure every critical feature is
> forward-facing and every feature has a home. The **left role-based rail stays exactly as it is**
> (owner directive). This plan re-prioritizes the **bottom bar**, prioritizes the **top-right user
> menu**, and closes the **mobile-orphan gaps** so nothing is desktop-only.

## The answer up front

The chrome we already have is close to best practice. The changes are small and data-level, not a
teardown:

1. **Bottom bar** — swap **Messages** out for **Events**, and move Messages to the header (top-right,
   with an unread badge) where DMs conventionally live. The four thumb tabs become the four things a
   local-community member returns to most: **Home · Community · Events · The Quest**, with the center
   **Zap** create button between them.
2. **Top-right user menu** — reorder to a prioritized, grouped list (You · Membership · Commerce ·
   Community · Support · Sign out) and hide the gated items unless the viewer qualifies.
3. **Orphan fixes** — surface the operator **Context Switcher / View-as**, the **Messages** icon, and
   the **About/Legal** links on mobile so no feature is reachable only on desktop.

Everything is a data edit in `lib/nav/registry.ts` (`CALM_SPINE_ROOTS`, `PROFILE_LINK_SEEDS`) plus a
few `hidden sm:`/`md:` class flips in `components/layout/app-shell.tsx`. No new subsystem.

## Best practice we are designing to

| Principle | Source | How we apply it |
|---|---|---|
| **3–5 primary tabs**, no more; use a "More" for the long tail. | [Material / UX Planet](https://uxplanet.org/bottom-tab-bar-navigation-design-best-practices-48d46a3b0c36), [UXPin](https://www.uxpin.com/studio/blog/mobile-navigation-examples/) | 4 destination tabs + the Zap action; the **Menu** drawer is the "More" that holds the whole rail. |
| **Thumb zone** — the bottom third is the reachable area; put the top-priority item where the thumb lands. | [Webdesignerindia](https://webdesignerindia.medium.com/thumb-zone-optimization-mobile-navigation-patterns-9fbc54418b81) | Primary destinations live in the bottom bar; the center Zap sits at the natural thumb rest. |
| **One FAB, only for the app's defining action.** | [Appypie](https://www.appypie.com/blog/app-navigation-patterns) | The center **Zap** (capture/create) is that one action. Keep it. |
| **Badges on tabs drive engagement.** | [UXPin](https://www.uxpin.com/studio/blog/mobile-navigation-examples/) | Give Events (and the relocated Messages icon) unread/soon badges. |
| **Hamburger halves discoverability** — reserve it for secondary items. | [Onething](https://www.onething.design/post/hamburger-menu-vs-tab-bar) | The long tail (Journeys, Practices, Market, Spaces, Leadership, admin) stays in the Menu drawer; the *critical* destinations get promoted OUT of it into the bar. |
| **Persistent "you are here"** with one highlighted tab. | [UXPin](https://www.uxpin.com/studio/blog/mobile-navigation-examples/) | The bar already highlights the active root; unchanged. |
| **44px min touch targets, safe-area insets.** | [UX Planet](https://uxplanet.org/bottom-tab-bar-navigation-design-best-practices-48d46a3b0c36) | Already honored (`env(safe-area-inset-*)`, 3.5rem bar). |

## What exists today (ground truth)

- **Bottom tab bar** (`app-shell.tsx` → `MobileTabBar`, tabs from `calmSpine()` /
  `CALM_SPINE_ROOTS` in `lib/nav/registry.ts`):
  `Menu · Home(/feed) · Community(/circles) · [⚡ Zap] · The Quest(/crew) · Messages(/messages) · Stats`.
- **Menu drawer** renders the entire desktop rail (`NAV_AREAS`) — the long tail is already reachable.
- **Stats drawer** is the Quest gamification peek (streaks/Gems) + a link to `/crew`.
- **Top-right AccountDropdown** = Profile · Invite · the `profile` menu (Account/Commerce/Community/
  Support from `PROFILE_LINK_SEEDS`) · Report a bug · Theme · Sign out.
- The left rail (`NAV_AREAS`) is role-gated and **stays as-is**.

## 1. Bottom bar — prioritized to key features

**Ranking test:** what does a *local-community member* open again and again? Feed (home), their people
(Community), what's happening near them (Events), and their practice/streak (The Quest). Messages is a
return destination too, but it has a natural home in the header cluster (top-right, badged) the way most
social apps place DMs, and moving it there frees a precious tab for **Events** — a top reason people join
a local network, and today buried in the drawer.

**Recommended bar (left → right):**

| Slot | Item | Route | Why it earns a slot |
|---|---|---|---|
| 1 | **Menu** (overflow) | drawer | The "More" — holds the whole rail long tail. Keep. |
| 2 | **Home** | `/feed` | The stream. The #1 return surface. |
| 3 | **Community** | `/circles` (or `/network`) | People + Circles. The point of the platform. |
| 4 | **⚡ Zap** (center FAB) | capture | The one defining action (post / Event / Contact / Connect). Keep. |
| 5 | **Events** | `/events` | **NEW.** Local happenings, high intent, currently drawer-only. |
| 6 | **The Quest** | `/crew` | Streaks/Zaps — the signature engagement loop. |
| 7 | **Stats** (right) | drawer | The Quest gamification peek. Keep (see note). |

**The one swap:** Events replaces Messages as a tab. **Messages** moves to the header top-right (the
Messages popover already exists there — it is just `hidden sm:` today; unhide it on mobile and add the
unread badge). This is a one-line change to `CALM_SPINE_ROOTS` + a class flip.

**Optional simplification (if you want a stricter 5-item bar):** fold the **Stats** drawer into the
**The Quest** tab (its `/crew` dashboard already shows the same streak/Gems). That drops the bar to
`Menu · Home · Community · [Zap] · Events · The Quest` — six touch targets, closer to the 5-item ideal —
without losing anything. Recommended as a fast follow, not required.

## 2. Top-right user menu — prioritized personal settings

The survey found **no orphan settings** and a clean split between personal and operator surfaces. The
menu should be a prioritized, grouped list; gated items appear only when the viewer qualifies. Space and
admin consoles do NOT belong here (they live in the space "Customize" rail).

**Recommended order (top → bottom):**

| Group | Items (in priority order) | Notes |
|---|---|---|
| *Identity* | Name · `@handle` | Header, non-interactive |
| **You** | **View profile** · **Settings** (`/settings`) · **Notifications** (`/settings/notifications`) · **Appearance / theme** | The daily-reach personal controls. Theme stays a one-tap cycle. |
| **Membership** | **Billing & Plans** (`/settings/billing`) · *Receive payments* (`/settings/billing`, earners only) | Normalize the label to one name (see naming risk). Payouts only when `canReceivePayouts`. |
| **Commerce** | **My orders** (`/orders`) · *My storefront* (`/market/manage`, sellers only) | |
| **Community** | **Friends** (`/network/friends`) · **My code** (`/codes`) · **Invite friends** (earn Zaps) · *Entry points* (`/entry-points`, crew+) | "My code" is the personal connect QR. |
| **Support** | **Help** (`/help`) · **Report a bug** · **Support tickets** (`/support`) | |
| **Session** | **Sign out** | Danger-toned, last. |

**Also fold in on mobile** (currently desktop-rail-only, so they would orphan): the operator
**Context Switcher** ("You're in…") and janitor **View-as** belong in the mobile menu's identity block
for anyone who has them, so operators can switch hats on a phone.

**Naming risks to fix first** (per `docs/NAMING.md`): billing shows three labels across surfaces
(Membership & billing / Billing & Plans / Billing) — pick one. "Broadcasts" is the member word for the
internal `dispatches` category; keep it consistent.

## 3. Every feature has a home — mobile-orphan closeout

From the feature survey, the gaps and their fixes (all small):

| Orphan today | Fix |
|---|---|
| **Messages** peek + **daily-streak** pill are `hidden sm:` (desktop header only) | Unhide Messages as a badged header icon on mobile (part of change #1); the streak already links to `/crew` and lives in the Quest tab/Stats. |
| **Context Switcher / View-as** (operator hat-switching) live only in the desktop rail profile card | Render them in the mobile user-menu identity block (change #2). |
| **About / What is Frequency / Terms / Privacy** (desktop mega-menu only) | Add an "About" group to the Menu drawer footer (or the Support group of the user menu). Help is already in the menu. |
| **UpgradeCrew** upsell + top-of-rail bug report (desktop right rail) | Bug report already survives in the user menu; surface the upgrade nudge in the Stats drawer or user menu. |
| **Create** intents (New Circle / Room / Broadcast) not in the Zap capture menu | Confirm the Zap capture sheet covers the create intents you want thumb-reachable; add the missing ones. |
| Operator **Space `/manage` + `/settings/*`** consoles are desktop-tuned | Reachable via the drawer today; a thumb-friendly console pass is a larger follow-up, tracked separately. |

## Where the changes land (files)

| Change | File | Kind |
|---|---|---|
| Bottom-bar tabs (Events in, Messages out) | `lib/nav/registry.ts` (`CALM_SPINE_ROOTS`) | data edit |
| Messages → header icon on mobile; badges | `components/layout/app-shell.tsx` (unhide `hidden sm:`) | class flip |
| User-menu order + gating + Context Switcher/View-as on mobile | `lib/nav/registry.ts` (`PROFILE_LINK_SEEDS`) + `app-shell.tsx` (`AccountDropdown`) | data + render |
| About/Legal in the drawer footer | `components/layout/member-footer.tsx` / drawer | data edit |
| Optional: fold Stats into the Quest tab | `app-shell.tsx` (`MobileTabBar`) | render |

## Rollout

- **Step 1 (the swap):** Events in the bar, Messages to the header. One data edit + one class flip.
- **Step 2 (the user menu):** reorder + gate + add Context Switcher/View-as. Data + small render.
- **Step 3 (orphan closeout):** About/Legal in the drawer, upgrade nudge, Zap create-intents.
- **Step 4 (optional):** collapse Stats into the Quest tab for the stricter 5-item bar.

Each step is independently shippable and reversible; none touches the left role-based rail.

## References

- Nav source of truth: `lib/nav/registry.ts` (`calmSpine`, `CALM_SPINE_ROOTS`, `PROFILE_LINK_SEEDS`,
  `paletteDestinations`), `lib/nav-areas.ts` (`NAV_AREAS`), `components/layout/app-shell.tsx`
  (`MobileTabBar`, `MobileLeftDrawer`, `AccountDropdown`), `lib/layout/page-chrome.ts` (rail resolvers).
- Naming canon: `docs/NAMING.md`. Voice: `docs/CONTENT-VOICE.md`. Page kit: `docs/PAGE-FRAMEWORK.md`.
