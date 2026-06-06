# Navigation Restructure — proposed IA (🟡 DRAFT, pending owner approval)

> **Goal (owner):** everything reachable from the **left menu**, in a **categorical** structure, with
> **minimal drill-down**; function condensed into **contextual pages + Growth-Studio-style dashboards**;
> **right-column navigation removed**. This doc is the **map to approve** — nothing is built until it is.

## Principles

1. **Left menu only.** The right rail carries no navigation (see §4).
2. **Categories, not depth.** ~6 member categories + 1 operator category; each holds a *few* items.
3. **Condense, don't drill.** The game/quest sprawl and the 9 admin suites collapse into **dashboards
   with internal sections/tabs**, not many left-nav routes.
4. **Contextual pages keep their inline editors** (Puck, practice/event/circle/contact/deal/sequence
   editors) — those *are* the "do the work here" surfaces. We don't move editing into the nav.

---

## The proposed left menu

Sections appear top→bottom; operator sections unlock by role.

### ⌂ HOME
- **Feed** — your activity stream + Capture
- **Around You** — community dashboard (dispatches · upcoming events · new circles) *(absorbs the
  right-rail Dispatches/Events widgets)*

### ◇ COMMUNITY  *(browse / discover)*
- **Circles** · **Channels** · **Events** · **Marketplace** · **People** (directory)
- *Each is index → detail. No third level.*

### ✦ PRACTICE
- **Journeys** — the plans you're on
- **Practices** — daily habits **+ Library folded in** as a "Curated" filter/tab (one destination, not two)

### ◈ QUEST  *(condense `/crew/*` — 10 routes → 1 dashboard)*
- **Quest** — dashboard with **sections** (no drill-down): Stats · Today's move · Tasks · Streaks ·
  Achievements · Challenges · Leaderboard *(absorbs the Game-Stats dock + Leaderboard widget)*
- **Store** — gems **+ Vault folded in** (balance · history · achievements)

### ✉ MESSAGES
- **Messages** — DMs + rooms **+ Friends folded in**

--- *operator (role-gated) below* ---

### ⚒ STUDIO  *(the big condensation — Growth-Studio-style hubs)*
- **Community Studio** *(host+)* — one dashboard over today's `/admin` **Spaces · Engage · Comms ·
  Safety**: circles · channels · events · hubs/nexuses · broadcasts · moderation · gamification · tasks
- **Growth Studio** *(host+)* — **already built**: pages · onboarding sequences · entry points · QR ·
  links · pipeline · marketing
- **Network** *(host+)* — **unify the 3 contact surfaces**: Directory + your captured **Profiles**
  (`/connections`) + **Marketing contacts** → one Contacts hub with tabs
- **Insights** *(janitor)* — one dashboard over the 6 read-only reads (engagement · intel · outcomes ·
  expansion · segments · AI narrative)
- **Platform** *(janitor)* — operator keys: members · roles · Vera · AI controls · demo

### ⚙ ACCOUNT  *(avatar menu, not the main rail)*
- **Settings** — one hub, **sections** not routes (profile · account · notifications · billing)
- **Help** · **Sign out**

---

## What moves / merges (current → proposed)

| Today | Problem | Proposed |
|---|---|---|
| `/crew` + `/crew/{store,quests,achievements,challenges,leaderboard,journeys,arcs,streaks}` (10 routes) | Sprawl, no tab nav | **Quest** dashboard (sections) + **Store** (Vault folded in) |
| `/admin` 9 suites / 23 pages | Deep drill-down | **Community Studio** (Spaces/Engage/Comms/Safety) + **Insights** (the 6 reads) + **Platform** (members/roles/Vera/AI/demo) |
| `/marketing` (10 tabs, full-screen takeover) | Hijacks the shell | Fold into **Growth Studio** (keep the rail; marketing becomes a Growth sub-area) |
| `/people` · `/connections` · `/marketing/contacts` | 3 contact surfaces | **Network** — one hub, tabbed (Directory · Profiles · Contacts) |
| `/settings` (5 routes, no tabs) | Fragmented | **Settings** hub, internal sections |
| `/library` vs `/practices` | Two paths to content | **Practices** with a Curated/Library tab |
| `/friends` | Stranded | Folded into **Messages** |
| `/vault` (redirect), `/crew/journey(s)`, `/crew/arcs` | Legacy/dupes | Folded into Quest / Journeys; retire redirects |

## §4 — Right-rail removal

`lib/layout/page-chrome.ts` already suppresses the rail on FOCUS surfaces. Proposal: **drop the global
right rail entirely**; relocate its widgets so nothing is lost:

| Right-rail widget | New home |
|---|---|
| Recent Dispatches · Upcoming Events · New Circles | **Around You** |
| Active Members | **People** (and circle/channel detail) |
| Leaderboard + Game-Stats dock | **Quest** dashboard |

Result: one column of content + the left menu. (Scope rails on circle/channel *detail* can stay as
in-body context, not global nav — owner's call.)

## On-page edit features (preserved)

These stay as contextual edit surfaces (FOCUS, no rail): Puck page editor (`/edit/[slug]`), practice
editor, event create, circle inline-edit, marketplace edit, contact editor, **CRM deal form** (§9.5),
**sequence editor** (§9.1), QR studio, profile/account settings. The nav points *at* them; editing
happens *in* them.

## Open questions for approval

1. **"Around You" naming** — keep, or rename to **Community Hub**? (Feed vs Around You currently blur.)
2. **Practices ⊕ Library** — fold Library into Practices as a tab, or keep separate?
3. **Marketing** — fold under Growth Studio (recommended), or keep as its own Studio entry?
4. **Scope rails** (circle/channel detail in-body rail) — keep as context, or also remove?
5. **Quest** — one dashboard with sections is the recommendation; confirm you want achievements/
   challenges/leaderboard as *sections*, not nav items.

---

**Build sequencing (after approval):** (1) collapse `/crew/*` into the Quest dashboard · (2) Community
Studio + Insights + Platform dashboards over the existing admin pages · (3) Network contact unification
· (4) Settings hub · (5) remove the global right rail + relocate widgets · (6) rewrite `NAV_AREAS` to
the new categories (the Site-Navigation suite, BACKLOG §J, would later make this owner-editable).
