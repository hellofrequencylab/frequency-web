# Tier 5 — Beta launch (apex cutover + partner loop)

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md`,
> `docs/DOCS-PROTOCOL.md`, `docs/LAUNCH.md`, and `docs/START-HERE.md` before starting.

## Why this tier

Get Frequency live on `findafreq.com` with the Phase 3 partner loop closed.

> **Ordering note:** this tier has **no code dependency on Tiers 1–4**. If you want to
> ship beta before hardening, you can run this one first. The default plan hardens
> first for a lower-risk launch.

## Prerequisites

Ideally Tiers 1–4 merged (for a hardened launch), but not required. Branch from
latest `main`. The production env vars are already documented in `.env.example`.

## Scope

1. **Partner redemption-on-capture wiring** (code).
   - When a node is claimed at `app/(main)/n/[nodeId]`, emit a `partner_redemption`
     event alongside the existing capture event. Engagement spine lives in
     `lib/engagement/capture.ts` / `events.ts` / `verify.ts`; partner data layer is
     `lib/partners/read.ts`.
   - Record the redemption (partner + discount + member proof) and **surface the earned
     discount to the member** post-claim (toast and/or follow-up email).
   - Verify end-to-end with a test node claim.
2. **Apex cutover + production config** (mostly ops; the session prepares and verifies).
   - Per `docs/LAUNCH.md`: add `findafreq.com` + `www.findafreq.com` to Vercel; set DNS
     records; set production env vars (see `.env.example`, incl. `NEXT_PUBLIC_SITE_URL`,
     VAPID keys, `CRON_SECRET`, `UNSUBSCRIBE_SECRET`).
   - Confirm in code that `robots.txt`, `sitemap.xml`, OG images, and `lib/site.ts`
     resolve to the apex domain (no hard-coded `*.vercel.app`).
   - **Clearly flag every step that requires me to act in the Vercel dashboard or DNS
     provider** — you cannot perform DNS/Vercel changes from the session.
3. **Smoke tests.** Run the launch smoke tests in `docs/LAUNCH.md` (signup → join circle
   → log a practice → WAM increments) against the preview/prod deploy.

## Key files

- `app/(main)/n/[nodeId]/*`, `lib/engagement/capture.ts`, `lib/partners/read.ts`
- `lib/site.ts`, `app/robots.*`, `app/sitemap.*` (verify apex)
- `docs/LAUNCH.md`, `docs/START-HERE.md` (tick off)

## Validation

```bash
npx tsc --noEmit
npx eslint .
npm test
```

Plus the manual smoke checklist in `docs/LAUNCH.md`.

## Docs

- Tick off `docs/LAUNCH.md` / `docs/START-HERE.md` as steps complete.
- Add a `docs/CHANGELOG.md` entry for the member-facing partner reward, and a
  **help article** in `content/help/` if member behavior changes (per
  `docs/HELP-CENTER.md` + `docs/DOCS-PROTOCOL.md`).

## Definition of done

- Partner redemption records end-to-end and the member sees their discount.
- Apex config prepared/verified in code; manual DNS/Vercel steps clearly listed for me.
- Smoke tests pass. tsc/eslint/test green. CHANGELOG/help updated. Draft PR opened.

## Kickoff prompt

> Read `docs/sessions/tier-5-beta-launch.md` and complete it end to end: wire partner
> redemption-on-capture, prepare/verify the apex production config per docs/LAUNCH.md
> (flag manual DNS/Vercel steps for me), run the smoke tests, update CHANGELOG/help,
> validate, and open a draft PR.
</content>
