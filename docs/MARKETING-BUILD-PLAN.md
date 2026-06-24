# Marketing Pages: phased build-out plan

> **Status: PROPOSED (June 2026).** The execution plan for the public-facing site.
> Strategy companion to [`docs/PUBLIC-SITE-PLAN.md`](PUBLIC-SITE-PLAN.md) (the funnel
> research) re-pointed to the cold-start, philosophy-led launch. Voice is governed by
> [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md); names by [`docs/NAMING.md`](NAMING.md).
>
> **Punctuation hard rule:** no em dashes or en dashes anywhere in this plan or any copy
> it specifies. Periods, commas, parentheses, or rewrite.

**Legend:** ✅ exists (keep) · 🛠 improve (exists, fix it) · 🆕 new (build it) · S/M/L effort.

---

## The answer first

We are launching a **movement, not a marketplace.** There is no content yet and no "three
Circles near you" to point at, so the public site cannot sell proximity. It sells a
**philosophy and a role:** the world is lonelier than ever, the third place is gone, and the
fix is ordinary people choosing to build community where they already are. The founder's
launch (worldwide, to social, no local inventory) recruits **builders first.** So the site
inverts the usual funnel: the hero is not "find your people," it is **"be the reason your
people have somewhere to go."**

Everything ladders to one of **three roles** the visitor self-selects at `/start`:

| Role | Who | What we hand them | First action |
|---|---|---|---|
| **Lead** | The community builder (the founder's audience; original adopters) | The format, the first-night script, the rails, and backup | Start one Circle |
| **Practice** | The participant who can engage from anywhere right now | Journeys, Practices, the Mindless timer (virtual, solo-first) | Do one practice today |
| **Spread** | Everyone else | A way to take a role in building community around them (invite, host once, share) | Share / bring one person |

The build is mostly **authoring**, not net-new engineering: the Puck page editor, a 24-block
kit, the `marketing-ui` component set, the JSON-LD helpers, and the sitemap already exist.
We add a vector illustration kit (matching beta onboarding), a few new Puck blocks (role
picker, illustrated feature), new editable page slugs, and the SEO/AIO wiring, then author
every page as a published Puck layout.

---

## What already exists (build on it, do not rebuild)

| Capability | Where | Use it for |
|---|---|---|
| **Puck visual editor** (`@measured/puck`), admin-only at `/edit/[slug]` | `lib/page-editor/*`, `components/page-editor/*` | Author every marketing page as content; publish to `pages` table; public renders server-side via `<Render>` |
| **24-block kit** (Hero, FeatureGrid, StatRow, **Tiers** pricing cards, Accordion/FAQ, CallToAction, MediaText, Checklist, Showcase, LiveStats/Events/Posts) | `components/page-editor/blocks/*` | The vocabulary for page content. Add only what is missing |
| **Editable slugs registry** | `lib/page-editor/data.ts` (`EDITABLE_PAGES`) | Add a slug here + a template + a public route to make a new editable page |
| **Page templates (seeds)** | `lib/page-editor/templates/*.ts` | Author default content as Puck `Data`; loads into the editor; publish to go live |
| **Marketing component library** | `components/marketing/marketing-ui.tsx`, `motion.tsx`, `vector-art.tsx` | Hardcoded pages (home/about) and Puck block internals |
| **Beta-onboarding vector renders** | `components/onboarding/renders/*`, `components/onboarding/welcome-art.tsx` | The *style reference* for the new illustration kit (inline SVG, DAWN tokens, no external art) |
| **JSON-LD builders** | `lib/jsonld.ts` + `components/json-ld.tsx` (escapes injection) | Organization/Website/Breadcrumb/FAQ/Event/Journey schema; extend with Article + HowTo |
| **Dynamic sitemap (redaction-safe, activity-gated)** | `app/sitemap.ts` | Already lists pillars/pricing/discover/help; new pages auto-extend |
| **robots** | `app/robots.ts` | Wildcard-allows all crawlers (AI bots included); add explicit AI-bot allows + a curated `/llms.txt` |
| **Help center** (filesystem articles + reindex) | `app/(help)/help/[category]/[slug]`, `docs/help/` | Member-facing informational layer + AI-citation asset |
| **Marketing chrome** | `components/layout/marketing-header.tsx`, `marketing-footer.tsx`; nav in `lib/site.ts` | Header/footer for new pages; update nav to add Lead/Practice/Spread |

**Code-locked pages (ADR-180):** `/` (home) and `/about` are intentionally NOT in the Puck
editor, to prevent a published draft shadowing the crafted design. We re-author their JSX
directly. Everything else is authored in Puck.

---

## The pages (full inventory)

Grouped by funnel role. Audit vs `app/(marketing)/`, `app/discover/`, `app/(help)/`.

### The spine: philosophy + role selection

| Page | Route | Status | Authoring | Job |
|---|---|---|---|---|
| **Home** (philosophy-led) | `/` | 🛠 re-author | Code (locked) | The manifesto: the third place is gone; you can rebuild it. One CTA into `/start`. Live proof when it exists, honest emptiness when it does not |
| **Start** (role picker) | `/start` | 🛠 rebuild | Code + Puck branches | One decision: Lead / Practice / Spread. Each routes to its landing + first action. Account last, magic-link only |
| **Lead** (builder landing) | `/lead` | 🆕 | Puck | As strong as the home. "Host one Circle. We hand you the format. You are not alone." |
| **Practice** (participant landing) | `/practice` | 🆕 | Puck | "Start where you are, today." Journeys, Practices, Mindless timer, all virtual/solo-first |
| **Spread** (everyone landing) | `/spread` | 🆕 | Puck | "Take a role in building community around you." Invite, host once, share the idea |
| **About** | `/about` | 🛠 keep, refresh | Code (locked) | Moonlight Beach origin, the philosophy, the founder, trust |

### The philosophy pillars (already Puck-editable)

| Page | Route | Status | Job |
|---|---|---|---|
| **The Community** | `/the-community` | ✅ re-author content | Pillars, Channels, Circles; ritual-first ("meets Thursday at 7") |
| **The Quest** | `/the-quest` | ✅ re-author content | The game loop, self-aware ("we made it a game so you'd actually do it") |
| **The Lab** | `/the-lab` | ✅ re-author content | The physical third place; the proof-of-concept the movement scales |
| **How it works** | `/how-it-works` | 🛠 un-retire or keep redirect | Currently 308 → `/the-community`. Decide: a real three-step plan page, or keep merged |

### Conversion + commerce

| Page | Route | Status | Job |
|---|---|---|---|
| **Pricing** | `/pricing` | 🛠 re-author | NORMAL pricing page (not a seed campaign). Member featured. Every section listed + detailed; unbuilt ones "Coming Soon" (see §Pricing) |
| **Beta / waitlist** | `/beta`, `/beta/confirm` | ✅ keep | Founding-cohort intake, double opt-in (until GA) |
| **Sign in** | `/sign-in` | ✅ keep | Magic link + Google |

### Discover (live community showcase) — already built

`/discover` + `/discover/{circles,events,topics,journeys,practices,partners}` ✅ keep. These
are the "browse before you commit" surface; soft CTAs only. No change needed beyond linking.

### SEO pillars + member help (content assets)

| Cluster | Canonical page | Status | Role |
|---|---|---|---|
| Adult friendship / loneliness | `/loneliness`, `/friendship-as-an-adult` | 🆕 | Seeker problem-aware entry, answer-first, soft CTA to `/practice` or `/discover` |
| How to build community | `/how-to-build-community` | 🆕 | The Lead pillar's SEO entry ("how to start a community group") |
| Quit the feed / calm down | `/life-after-the-feed`, `/cant-switch-off` | 🆕 | Practice entry; routes to Mindless + Practices |
| Member help | `/help/*` | 🛠 fill | Lifecycle help (getting started, the Quest, leading), FAQ + Article schema |

---

## The Puck authoring approach

Each new page is three small additions plus content authoring:

1. **Register the slug** in `lib/page-editor/data.ts` (`EDITABLE_PAGES`): `{ slug, title, path }`.
2. **Author a template** in `lib/page-editor/templates/<slug>.ts` as Puck `Data` (the block
   tree). This is where the *content* lives, in the locked voice.
3. **Add a public route** `app/(marketing)/<slug>/page.tsx` that calls
   `getPublishedData(slug)` + `<Render config data />`, with a hardcoded legacy fallback and
   `generateMetadata()` for SEO.
4. **Publish** the template (operator clicks Publish, or we seed `published_data`).

**New blocks to add to the kit** (only what the kit lacks):

| Block | Why | Fields |
|---|---|---|
| **RolePicker** | The `/start` three-role decision and home CTA | role cards (label, blurb, illustration, href), layout |
| **IllustratedFeature** | Feature sections with the vector art (the user's explicit ask) | illustration name, eyebrow, title, body, side, CTA |
| **Manifesto** | The philosophy statement blocks (large, plain, one idea each) | text, accent, tone |

The existing **Tiers** block already covers pricing cards (featured ribbon, badge, struck
price, features, CTA), **Accordion** covers FAQ, **FeatureGrid/MediaText** cover features,
**StatRow/LiveStats** cover proof. Reuse them; do not duplicate.

---

## The vector illustration kit (matches beta onboarding)

The beta onboarding uses **hand-authored inline SVG React components** styled only with DAWN
semantic tokens (no external asset library, no commissioned art, themes automatically). We
mirror that exactly.

- **Location:** `components/marketing/illustrations/` (a new kit), with an
  `<Illustration name="..." />` wrapper so Puck blocks and code pages reference art by name.
- **Style:** clean line-art / minimal vector, simple shapes (circles, rects, paths, labels),
  semantic tokens only (`text-primary`, `fill-signal`, `stroke-border-strong`, …), `role="img"`
  + `aria-label`, `motion-safe` animation, `prefers-reduced-motion` respected. No hardcoded hex.
- **Set (one per core concept / feature):** `lead` (a builder setting up chairs), `practice`
  (a calm timer / breath), `spread` (ripples outward), `circle`, `feed`, `events`, `journey`,
  `mindless`, `quest`, `lab`, `community`, `belonging`. Extend as pages need.
- **Reference:** `components/onboarding/welcome-art.tsx` (8 spot illustrations) and
  `components/onboarding/renders/*` (3 mockup renders) are the working pattern to copy.

---

## Pricing page (normal page, every section listed)

> Per the owner: treat `/pricing` like a **normal pricing page, not a seed/founder campaign.**
> Feature regular **Member** pricing. List AND detail pricing for **everything** in the
> pricing section; anything not yet purchasable is shown, fully detailed, and marked
> **Coming Soon** (never hidden).

Authored with the existing **Tiers** block (one card per option) plus a "what membership
funds" section and an FAQ. **Member is the featured (highlighted) card.** Three sections:
Membership (people), For Spaces (practitioners/businesses), and Add-ons. Everything is
listed and detailed; anything not yet purchasable shows its real price and a **Coming Soon**
badge (billing is gated by the `billing_live` master flag, OFF by default, so nothing
charges yet). Drop the beta/founder/seed framing entirely. Prices below are the GA defaults
from `lib/pricing/settings.ts` (`PRICING_DEFAULTS`).

**Section 1 — Membership (people).** Member is featured.

| Tier | Price | Interval | Unlocks | Status |
|---|---|---|---|---|
| **Member** ⭐ featured | Free | forever | Browse Circles/Events, attend gatherings, earn Zaps, Vera (10/day) | **Live** |
| **Crew** | $9/mo or $90/yr | monthly + annual (2 mo free) | Full community, full gamification (Gems + Vault cash-in), Vera unlimited, leaderboard | **Coming Soon** |
| **Supporter** | $24/mo or $240/yr | monthly + annual | Everything in Crew + fund a member who cannot pay (hold the door) | **Coming Soon** |

**Section 2 — For Spaces (practitioners, businesses, orgs).** All Coming Soon.

| Plan | Price | Take-rate | Unlocks | Status |
|---|---|---|---|---|
| **Free** | Free | n/a | Basic Space listing | **Live** |
| **Practitioner** | $19/mo or $190/yr | 8% | Space CRM, basic automation | **Coming Soon** |
| **Business** | $49/mo or $490/yr | 5% | + Email/marketing, team roles, multi-pipeline, Resonance (read) | **Coming Soon** |
| **Nonprofit** | $29/mo or $290/yr | 5% | Business feature set for verified 501(c)(3) | **Coming Soon** |
| **Partner** | Comped + revenue share | varies | Full Business set; operator-assigned (not sold) | invite-only |
| **Organization** | $199/mo | 3% | + Reporting, full Resonance AI, premium support (talk to us) | **Coming Soon** |
| **White-label** | $299/mo + $1,500 setup | 3% | Organization + full branding removal (lead form) | **Coming Soon** |

**Section 3 — Add-ons (Space owner tools).** All Coming Soon, display-only today.

| Add-on | Price | What it is | Status |
|---|---|---|---|
| **Space Memberships** | Owner-set (e.g. $25 to $100/mo) | Paid member tiers a Space owner defines | **Coming Soon** |
| **Bookings** | Owner-set per slot | Paid 1:1 sessions on a Space's calendar | **Coming Soon** |
| **Donations** | Suggested amounts | Support a Space's fund | **Coming Soon** |

Voice: access not extraction; a "what it funds" section names concrete operating costs (the
room's lights, insurance, the thermal circuit); risk reversal ("no card today, leave
anytime"); roles are "earned, not bought" (Host/Guide/Mentor are never purchasable); no fake
scarcity, no countdowns. FAQ covers free-forever, what Coming Soon means, refunds, and that
leadership is earned. Crew/Supporter cards show their price with the Coming Soon badge and a
disabled CTA (the `Tiers` block already supports badges + struck price + CTA style).

---

## SEO + AIO

AI citation is a primary acquisition channel for this demographic. The site must be
answer-engine-friendly from launch.

| Move | Action | File(s) | Status |
|---|---|---|---|
| Explicit AI-crawler allow | Add named allows (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Applebot, Google-Extended) alongside the wildcard | `app/robots.ts` | 🛠 |
| Curated `/llms.txt` | Short brand summary + key URLs (keep the self-maintaining `/llms-full.txt`) | `app/llms.txt/route.ts` | 🆕 |
| JSON-LD coverage | Add Article + HowTo builders; emit Organization on all pages, FAQPage on FAQs, HowTo on Lead guides, Event on discover | `lib/jsonld.ts`, page metadata | 🛠 |
| Per-page metadata | `generateMetadata()` on every new route; OG images | each route | 🆕 |
| Answer-first content | Every pillar/help H2 is the reader's question; first 1 to 3 sentences fully answer; one concept per section | templates + help md | 🆕 |
| Activity-gated city pages | DEFER until real Circle density exists (honest thinness; the cold-start has no inventory) | `app/sitemap.ts` discipline | ⏳ |

---

## Phased build sequence

Each phase is one or more CI-gated draft PRs (checks + analyze/CodeQL + autodoc + drift +
Vercel), squash-merged when green. Foundations first so pages have blocks and art to use.

### Phase 1 — Foundations (S/M)
- Vector **illustration kit** + `<Illustration>` wrapper (`components/marketing/illustrations/`).
- New Puck **blocks**: RolePicker, IllustratedFeature, Manifesto (register in `config.tsx`).
- Marketing **nav** update: add Lead / Practice / Spread to header + footer (`lib/site.ts`).
- SEO **infra**: robots AI allows + curated `/llms.txt` + Article/HowTo JSON-LD builders.

### Phase 2 — The spine (M)
- Re-author **home** (philosophy-led, single CTA to `/start`).
- Rebuild **`/start`** as the three-role picker (account last, magic-link).
- Build **`/lead`**, **`/practice`**, **`/spread`** landings (Puck slugs + templates + routes).

### Phase 3 — Conversion + pillars (M)
- Re-author **`/pricing`** (Member featured; all sections; Coming Soon; what-it-funds; FAQ).
- Re-author the three **pillar** pages (`/the-community`, `/the-quest`, `/the-lab`) in voice.
- Decide **`/how-it-works`** (real three-step page or keep the redirect).

### Phase 4 — Content moat (M, partly recurring)
- SEO **pillar** pages (loneliness, friendship-as-an-adult, how-to-build-community, life-after-the-feed).
- Core **help** articles (getting started, the Quest, leading) with FAQ/Article schema.
- Refresh **`/about`**.

### Phase 5 — Verify + polish (S)
- Full **funnel walk**: every CTA resolves; role branches land on the right first action.
- **Lighthouse / a11y / mobile** pass (83% of traffic is phone); every fold tested.
- **Schema validation**, sitemap diff, metadata coverage check.

---

## Standards (every page, non-negotiable)

- **Templated, not hand-rolled:** Puck blocks for content pages; `marketing-ui` for code pages.
- **Voice:** run the `CONTENT-VOICE.md` §10 checklist on every word. No em/en dashes. Name the
  situation, never the feeling. Proper nouns carry the magic; sentences stay plain.
- **Tokens only:** no hardcoded hex anywhere (blocks, illustrations, pages).
- **Secure:** rich text via the safe markdown parser (never `dangerouslySetInnerHTML`); JSON-LD
  via the escaping `<JsonLd>`; image hosts allowlisted; no auth-walled route indexed.
- **SEO/AIO compliant:** metadata + JSON-LD + answer-first structure on every page.
- **Fast:** Server Components; ISR on Puck pages; live data behind `<Suspense>`.
- **Docs protocol:** technical → this doc + `docs/DECISIONS.md` (ADR per decision);
  instructional ("how to edit a marketing page") → Notion Training DB, link back here.
