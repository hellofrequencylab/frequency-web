# Feature index — Frequency web

> The primary features of the platform, grouped by audience, with the route and the
> spec doc where one exists. Member-facing surfaces first, then the operator suite, then
> cross-cutting systems. This is a map, not a spec — follow the linked docs for depth.
> Legend: ✅ built · ⏳ partial · 🎨 designed (not built).

---

## 1 · Member — community & belonging

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Feed** | `/feed` | The home stream — posts, dispatches, events, scoped to the member's reach | — |
| **Around You** | `/broadcast` | Awareness surface: local dispatches/broadcasts & what's happening nearby | — |
| **Circles** | `/circles` · `/circles/[slug]` | Groups members belong to & gather in; one-tap join, walls, members, health | — |
| **Channels** | `/channels` | Topical broadcast channels members follow | — |
| **Events** | `/events` · `/events/[slug]` | Create/RSVP/check-in to gatherings (QR check-in, verified-practice) | — |
| **Marketplace** | `/market` | Local goods/services swap — no in-app payment, connect-only (ADR-148) | — |
| **People** | `/people` · `/people/[handle]` | Member directory + public profiles (gamification, achievements, timeline) | — |
| **Hubs & Nexuses** | `/hubs` · `/nexuses` | The geographic/organizational tree circles live in | SCALE-ARCHITECTURE |
| **Messages** | `/messages` | DMs + group rooms (friends-gated) | — |
| **Friends** | `/friends` | Friend requests; the key that unlocks messaging | — |
| **Search** | `/search` · ⌘K | Live cross-entity search overlay | — |
| **Discover** | `/discover` | Public browse layer (topics, etc.) | DISCOVER-LAYER |

## 2 · Member — practice (the North-Star engine)

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Journeys** | `/journeys` | Multi-step practice chains/arcs members progress through | ECONOMY-AND-JOURNEYS |
| **Practices** | `/practices` | The daily-action library — adopt, log, build streaks | — |
| **Library** | `/library` | Curated/reviewable practice content | — |
| **Journal** | `/journal` | The member's Capture daily-log | — |

## 3 · Member — The Quest (gamification)

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Quest dashboard** | `/crew` | One dashboard: stats · tasks · streaks · achievements · challenges · leaderboard | THE-QUEST |
| **Store** | `/crew/store` | Spend gems on titles, cosmetics, membership credits (absorbs the Vault) | — |
| **Vault** | `/vault` | Gems to spend | — |
| **Zaps · Gems · Ranks · Streaks** | (cross-cutting) | Real-life zaps + online gems; seasonal ranks; daily streaks (ADR-139) | GAMIFICATION-AUDIT · ENGAGEMENT-MECHANICS |

## 4 · Member — Capture, Vera & support

| Feature | Surface | What it is | Spec |
|---|---|---|---|
| **Capture** | Centre-nav / FAB → full-screen | Catch a moment from life: scan a card/poster, add a contact, post, note, photo | CONTENT-ARCHITECTURE |
| **Vera (AI companion)** | Right-edge pill → chat/help | Live Claude companion + deterministic concierge + help search; reads support tickets | AI-VERA · AI-STRATEGY |
| **Support tickets** | "Report a bug" anywhere → `/support` | File bugs/questions with page context + screenshot; track history; staff console (ADR-159) | SUPPORT-TICKETS |
| **Help center** | `/help` | Docs-as-code articles + (designed) AI/RAG search | HELP-CENTER · SUPPORT-SYSTEM |
| **Invite friends** | Account menu / Friends → modal | Personal invite link + QR; attaches the invitee & awards +40 zaps on join | — |

## 5 · Member — onboarding & activation

| Feature | Surface | What it is | Spec |
|---|---|---|---|
| **Beta induction** | `/onboarding/beta?seq=` | The cinematic voiced induction (splash → oath → intro → identity → place → tour → enter) | BETA-INDUCTION |
| **Audience sequences** | `/beta/[slug]` | Audience-targeted versions of the induction + cohort marketing tags | BETA-ACTIVATION |
| **Vera's chores / coach** | overlay + Next-Steps pill | Activation full-stop, then the single next move; gems-nudged. Coach popup redesigned (`chores-overlay`, only "Don't show till tomorrow") | BETA-ACTIVATION |
| **Onboarding edge tabs** | left/right margins | `edge-pill` tabs tucked into the margins, icon-only at rest | — |
| **Founder's First Week** | `/founder` | Six moves → Founder badge. All config (reward · Vera copy · page copy · the six tasks) centralized in `lib/onboarding/founder-config.ts` (ADR-184) | ONBOARDING-BUILD-LIST |
| **Daily check-in / streak** | header chip | Show-up streak with a header flame chip | — |
| **Quest control center** | right rail (top) | Always-on next-step + rank/streak progress | — |
| **Role training** | `/training` | Role-advancement curriculum on promotion (ADR-157) | — |

## 6 · Identity & personal codes

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Profile & settings** | `/settings` · `/settings/profile` | Identity, photo, header, contact, account, billing, notifications | — |
| **Personal QR codes** | `/codes` · Edit Profile | Connect/referral code → profile; styled QR PNG/SVG/link (matches editor style) | — |
| **vCard / save contact** | `/people/[handle]/vcard` | Downloadable contact card | — |
| **Upgrade to Crew** | `/upgrade` | Single conversion surface | — |

## 7 · Operator — Growth Studio (acquisition)

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Growth Studio** | `/growth` | The acquisition/onboarding launchpad (absorbed Marketing, IA §10.2) | LEAD-FLOWS |
| **Landing pages** | `/pages` · `/pages/edit/[slug]` | Block (Puck) page editor + publish | PAGE-EDITOR-SPEC · PAGE-FRAMEWORK |
| **Onboarding sequences** | `/pages/sequences` · `…/[slug]/build` | Beat-by-beat induction **version builder** + splash editor + share/QR (ADR-162) | — |
| **Entry points** | `/entry-points` | Crew QR campaigns that bring people in (flyers deferred) | ENTRY-POINTS |
| **QR Studio** | `/admin/qr` | Design/route/track managed QR codes (dynamic, A/B, styles) | — |
| **Links & codes** | `/codes` | Personal/referral short links | — |

## 8 · Operator — Network, CRM & comms

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **CRM pipeline** | `/crm` · `/crm/deals/[id]` | Deals, stages, activities | NETWORK-CRM · COMMS-CRM-ARCHITECTURE |
| **Profiles / Connections** | `/connections` | The captured member-contact network (consent ladder, §5.2) | MEMBER-DATA-PLATFORM |
| **Outreach** | `/outreach` | Steward composer | COMMS-STRATEGY |
| **Marketing suite** | `/marketing/*` | Campaigns · Funnels · Nurture · Automations · Analytics · Market read · Beta waitlist | ENGAGEMENT-MARKETING-ENGINE · MARKETING-AI |
| **AI operator (Agent)** | `/marketing/agent` (in Vera area) | Proposes winbacks/content drafts; runs through the consent/suppression spine | MARKETING-AI |

## 9 · Operator — community ops & platform

| Feature | Route | What it is | Spec |
|---|---|---|---|
| **Studio Overview** | `/admin` | The operator dashboard → all management surfaces | STUDIO |
| **Support console** | `/admin/support` | Triage queue: status/priority/assign, replies, internal notes, CRM link | SUPPORT-TICKETS |
| **Inline page admin** | "Admin ▾" accordion | Per-page admin dashboard (share QR + settings) in-page (ADR-160) | EMBEDDED-ADMIN |
| **Page Settings panel** | "Settings ▾" on any page | The on-page operator editor (`page-admin-bar` via `PageAdminProvider`) — content · per-page QR · circle rail order, gated by capability (ADR-180/181) | EMBEDDED-ADMIN |
| **Editable page content** | Settings panel → content | Operator-tunable header (title + description) per route; coded copy is the fallback. Site-wide via the `CONTENT_EDIT_ROUTES` registry (ADR-180/182) | — |
| **QR per-page folders** | Settings panel + `/admin/qr` | Create a QR *from a page* (`PageQrManager`, compact StyleEditor) and find it foldered by route in QR Studio (ADR-179) | — |
| **Circle Quest module** | circle Settings panel | The circle's "this week's practice" picker + its adopted journeys/practices/challenges (ADR-181) | — |
| **Roles & permissions** | `/admin/roles` | The NAV_AREAS permission grid (trust ladder × staff axis). Being reworked into three systems — Community / Partners / Admin — + a Free/Member/Supporter entitlement | ROLES |
| **Moderation** | `/admin/moderation` | Content/member moderation | — |
| **Structure** | `/admin/hubs` · `/admin/circles` · `/admin/events` | Manage the community tree & entities | — |
| **Insights** | `/admin/engagement` · `/admin/insights` · `/admin/intel` | First-party engagement analytics | ENGAGEMENT-ARCHITECTURE · ANALYTICS |
| **Vera admin** | `/admin/vera` | Tune Vera's voice + induction copy; the AI control room | AI-VERA · AI-CONTROLS |
| **Members admin** | `/admin/members` | Member operations | — |
| **Segments** | `/admin/segments` | Cohort segmentation (marketing tags) | — |
| **Demo / beta content** | toggle | Seeded demo content that recedes as real members join | DEMO-SYSTEM |

## 10 · Cross-cutting systems

| System | What it is | Spec |
|---|---|---|
| **Page framework** | One shell · five templates · chrome map; compose-don't-author | PAGE-FRAMEWORK |
| **Right rail panels** | Standing (Quest control center) + page-aware panels (who's online, circles, events, broadcasts, leaderboard), ADR-161 | — |
| **Gamification engine** | Idempotent engagement-event ledger → zaps/gems awards | ENGAGEMENT-ARCHITECTURE |
| **Attribution** | First-touch + referral (`fq_ref`) + entry-point A/B | LEAD-FLOWS |
| **Notifications · Presence** | In-app bell + live presence heartbeat | — |
| **AI kernel** | One governed core (Claude), kill switch, caps, tiering | AI-STRATEGY · AI-CONTROLS |
| **Hook federation** 🎨 | Multi-org hosting + cross-community federation (designed) | HOOK-FEDERATION-ARCHITECTURE · HOOK-MULTI-ORG-GOVERNANCE |

---

*Living index — add a row when a primary surface ships. Deeper roadmap lives in
[ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md); decisions in [DECISIONS.md](DECISIONS.md).*
