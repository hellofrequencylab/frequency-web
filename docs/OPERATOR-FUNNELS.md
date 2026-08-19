# Operator funnel doors

> **The answer, first.** Five niche marketing pages, one per operator type, that are the top of Frequency's
> operator acquisition funnels. Each has one job: get an aligned operator to **Start free** and bring their
> audience in. Same product underneath, five faces on top. **One chrome-free template, five configs.** These
> are the evolved persona doors at `/for/<niche>` (short slugs), not a parallel surface. Decision: ADR-591.

## 1. Name (and the collision it avoids)

The concept is a **funnel door**, not a "splash." "Splash" is already a shipped concept in this repo: the QR /
micro-site scan-time interstitial (`lib/qr/splash.ts`, `lib/qr/splash-render.ts`, the Loom "Splash" lane,
`qr-splash-form.tsx`). Reusing the word would muddy that vocabulary. A funnel door is an **indexable,
top-of-funnel marketing page**; a QR splash is a scan-time landing. Different things.

## 2. Architecture: evolve the persona doors

The five persona doors (`/for/[niche]`, `lib/marketing/funnel-config.ts`, shipped in #1624) already are the five
niches as short SEO/pricing sell pages. Rather than a second near-identical surface competing for the same
search terms, we **grow `/for/<niche>` into the full funnel template**: one surface per niche = SEO door +
conversion funnel unified, keeping the sitemap / JSON-LD / pricing-catalog wiring it already has.

- **Slugs (short, ADR-591):** `/for/coaches` · `/studios` · `/hosts` · `/communities` · `/nonprofits`. The
  long slugs shipped in #1624 (`coaches-and-healers`, `event-hosts`, `community-builders`) redirect to these.
- **Chrome-free layout.** The `(marketing)` layout imposes the full mega-nav + footer with no per-page opt-out,
  so the funnel template lives in its **own route group** with a minimal layout: a splash header (logo left +
  one `Start free` right, no nav) and a sticky mobile `Start free`. Pattern precedents: `app/page.tsx`
  (own-chrome) and `app/onboarding/layout.tsx` (no-chrome).

## 3. The fixed skeleton (same order, every niche)

Hero → AssuranceBar → ProblemSection → HowItWorks → FeatureBlocks → **LoopDiagram** → Pricing → Proof →
Mission → FAQ → FinalCTA → SplashFooter. Graphics are inline SVG in house tokens (no hardcoded hex), one
"active" element in the accent per graphic, decoratives `aria-hidden`, the Loop labelled with `<title>`/`<desc>`,
all responsive (`width=100%`, `preserveAspectRatio="xMidYMid meet"`), reduced-motion respected.

Shared, constant across all five (never re-authored per niche): the one CTA label **Start free** (+ one ghost
`See what's inside` in the Hero), the **LoopDiagram** copy ("Every hello, remembered." / "Every introduction,
an open door."), the **Mission** block, the **SplashFooter**, and the **AssuranceBar** base (the nonprofit
route swaps the last item to "Flat price, never per seat"). Source of truth for all shared copy +
the config type: **`lib/marketing/funnel-config.ts`**.

## 4. The config schema (only these change per niche)

`FunnelConfig` (`lib/marketing/funnel-config.ts`): `slug`, `mode` (the Space Mode a Start-free pre-seeds),
`hero`, `problem`, `howItWorks.steps[3]`, `features[3 + 1 soft]`, `pricing` (3-row beat + break-even caption +
fee note), `faq`, `finalCta`, and flags (`nonprofit`, `loopProminent`, `assuranceBar` override). Hero / Problem
/ HowItWorks / FeatureBlocks / Pricing / FAQ / FinalCTA read entirely from config; Loop / Mission / Footer /
AssuranceBar are shared constants. Config #1 (Coaches) is the reference build with full verbatim copy.

## 5. The Start-free bridge (the crux)

Today a logged-out visitor cannot create a free Space: `/spaces/new` is auth-gated, and the site CTA
(`/join`) builds a member profile, not a Space. So the funnel's whole promise is net-new work:
**minimal signup (deferred-auth pattern from `/join`) → create account → `createSpace` pre-seeded in
the niche's Mode (coaches -> business:packages, studios -> business:membership, hosts -> business:ticketed,
communities -> business:cohort, nonprofits -> nonprofit:donations) → land in the Space editor**, with
attribution carried through (`lib/attribution/*`, which already captures UTM + first-touch + referral at signup).

## 6. Measurement + SEO

- **Measurement.** First-party ledger (`lib/analytics/track.ts`, `events.ts`) + GA4 mirror. Add `splash.viewed`
  + `splash.cta_click` events; mount page-view tracking on the funnel layout via a client component (keeps
  ISR; the marketing layout deliberately omits `PageViewTracker`). Register a Growth-OS funnel object per niche
  (`lib/funnels/*`): entry = page_view -> wedge = cta_click -> capture = account.created -> convert =
  space.created, `goal_event` via `funnel_rollup`. Attribution + the QR referral loop (`app/q/[slug]/route.ts`,
  `lib/qr/referral.ts`, `getReferrer()` for a "[Name] invited you" personalization) are already shipped.
- **SEO.** Register slugs in `app/sitemap.ts`, `app/llms.txt/route.ts`, and `lib/nav/registry.ts` (which also
  has a pre-existing dead-slug bug at 173-176 to fix). JSON-LD via `lib/jsonld.ts` (article/faq/breadcrumb/
  product), the `/for/[persona]` metadata pattern.

## 6a. Loom registration (the graphics are shared design-system elements)

The five funnel graphics + the feature icon set (`components/marketing/funnel/funnel-graphics.tsx`) are
registered as reusable **Loom** elements, not one-off page art: catalogued in
`lib/library/element-catalog.ts` (`FUNNEL_ELEMENTS`, added to `REGISTRY_NAMES`), resolved to their live
components in `lib/library/element-registry.tsx` (SPOT + ICON maps), and seeded into `library_assets`
(shared master library, `kind='element'`, `config={registry,name}`) by
`supabase/migrations/20261023000000_loom_funnel_elements.sql`, so they appear + sort + search in Loom
Studio's element grid.

## 7. Pricing reconciliation (one honest source)

⚠️ The Coaches brief's **~~$79~~ $49/mo** pair is stale. Our whole site prices from one catalog
(`lib/billing/pricing-keys.ts`), where Business is **$29** (the $19 Opening Beta rate is CLOSED,
[ADR-1060](DECISIONS.md), so nothing renders a strike on it any more), and the anchor idiom is uniform (`monthly_cents` charged, `list_cents` struck). So the
brief needs no new number set: the 3-row funnel pricing beat reads its dollar figures from the catalog, so
the strike and the price show consistently on the funnel, `/pricing`, and the doors, and numbers never drift.

Break-even math is truthful, and it runs off the **network** rate, not a free-seller rate: a free tier
cannot sell at all (ADR-913), so the honest comparison is **Crew 8% vs Business 5%**, a 3-point saving on
network-sourced sales only. Business at **$29**, the price charged today, crosses at about **$967/mo**
(~"$1,000") in network-sourced sales. (At the retired $19 beta rate it was about $633/mo; that figure is
history, not an offer.) Own-audience sales and tips are
0% on both sides of that comparison, so they never enter the math.

## 8. Phases

- **P0 (this doc + ADR-591):** the config schema (`funnel-config.ts`) + Coaches config. ✅
- **P1:** the chrome-free template + shared components (splash header, sticky CTA, the section skeleton, the
  five SVGs, Pricing beat reusing the catalog), validated against Coaches.
- **P2:** the Start-free -> free Space signup bridge.
- **P3:** the other four configs (studios / hosts / communities / nonprofits + the nonprofit exceptions).
- **P4:** measurement events + Growth-OS funnel objects + SEO registration + the nav slug-bug fix.
- **P5:** referral-loop personalization + A/B (`fq_var`) + Proof content.

All copy obeys `docs/CONTENT-VOICE` (no em dashes, skeptic test) and `docs/NAMING` (Resonance Engine, not "AI
Engine"; Email + Automations, not "Dispatch"; Bookings; Contacts; QR Studio; Profile and brand).
