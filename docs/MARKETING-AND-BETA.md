# Marketing site, Beta funnel & Studio operations

The public front door + the beta acquisition funnel + the admin surfaces for
managing it. Built on the existing email spine (ADR-026) and the `contacts` CRM
(6.3). This is the acquisition layer; [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md)
covers the engine underneath.

> Status: shipped + live on the apex `frequencylocal.com` (GoDaddy → Vercel). The
> retired `go.findafreq.com` host 301-redirects here.

---

## 1. Public marketing site — `app/(marketing)/`

A long-form, editorial marketing site that lives in the same Next app, with its
own chrome (not the member shell).

| Route | File | Notes |
|---|---|---|
| `/` (splash) | `app/page.tsx` | Logged-OUT → vision splash; logged-IN → redirect `/feed` |
| `/the-lab` | `app/(marketing)/the-lab/page.tsx` | Venue vision (narrative only — no demand-proving) |
| `/how-it-works` | `app/(marketing)/how-it-works/page.tsx` | Interests / Circles model |
| `/about` | `app/(marketing)/about/page.tsx` | Moonlight origin story |
| `/beta`, `/beta/confirm` | `app/(marketing)/beta/*` | Waitlist — **PARKED** for the future gated phase (§2); not the live CTA target |
| `/discover` | (existing) | Public read-only community browse |

**Chrome & primitives**
- `components/layout/marketing-header.tsx` — scroll-aware header (transparent over
  the hero → solid light on scroll). **No search box** (search is member-only).
- `components/layout/marketing-footer.tsx`.
- `components/marketing/marketing-ui.tsx` — `PageHero`, `Section`, `SectionHeading`,
  `ZigZag` (alternating image/text, capped portrait images), `Statement` (big
  typographic interstitial), `Marquee`, `BetaCTA`. Token-only (DAWN) styling.
- Display face: **Anton** via the `.font-display` utility (`app/globals.css`,
  wired in `app/layout.tsx`). Body stays Nunito.
- Config in `lib/site.ts`: `MARKETING_NAV`, `BETA_CTA_LABEL`/`BETA_CTA_HREF`
  (**`/sign-in`** — the beta is open/self-serve; see §2 + ADR-071), `SITE_URL`,
  `ORG_LEGAL_NAME`, `CONTACT_EMAIL`. This one constant is the whole funnel switch.
- Imagery: `public/images/site/` (pulled from the old Squarespace, optimized).
- **No em dashes** in marketing copy (house rule).

### 1.1 Editing the pages — visual editor (Puck)

All 4 marketing pages are **WYSIWYG-editable**; no code or deploy needed to
change copy, images, or section order. Full design spec: [PAGE-EDITOR-SPEC.md](PAGE-EDITOR-SPEC.md).

**How to edit (janitor only):** open the **Pages** directory at `/pages` —
reachable from the main app nav under **Manage → Pages** (the link shows only for
the `janitor` community role, beneath Admin and Studio). **Edit** a page → opens
the full-screen editor at `/edit/[slug]`. The whole feature (directory, editor
route, publish/draft actions) is gated by `lib/page-editor/guard.ts`
(`getJanitor` / `requireJanitor`) — it is **not** part of the Studio. Drag blocks to
reorder, edit fields in the right panel, swap/upload images, then **Publish** →
live immediately (the route is revalidated). "Save draft" stores without
publishing.

**How it renders (fast + safe):**
- Public pages read `pages.published_data` and render server-side via
  `@measured/puck/rsc` `<Render>` — **no editor JS ships to visitors.**
- If a page row is missing/empty, the page falls back to the original hardcoded
  JSX (`Legacy*` component) → zero-downtime.
- Sub-pages are ISR (`revalidate = 3600`, re-validated on publish); the splash
  `/` stays dynamic (auth redirect to `/feed`).

**Block palette** (`lib/page-editor/config.tsx`, markup in
`components/marketing/blocks.tsx`): PageHero, ZigZag (image+text), Statement,
BetaCTA, Marquee, ImageBand, Spacer, Hero (full-bleed splash), FeatureGallery,
Pillars (dark band), and live **LiveStats / LiveEvents / LivePosts** (fed real
member/circle/event/post data via Puck `metadata`, fetched in
`lib/page-editor/live-data.ts`). The palette is brand-locked (DAWN tokens only).

**Infra:** `pages` table + public `site-media` bucket (migration
`20240226000000_pages_cms.sql`). Image uploads → `site-media` via
`lib/page-editor/upload-action.ts` (8 MB cap, `marketer`+). Publish/draft actions
in `app/edit/actions.ts`. Current content is **seeded** into the DB so the editor
opens on the real design.

---

## 2. Beta acquisition funnel — open / self-serve (ADR-071)

**Current model: the beta is OPEN.** "Join the Beta" routes straight to sign-in →
induction → real member. No queue, no lead-capture gate. The single switch is
`BETA_CTA_HREF = "/sign-in"` in `lib/site.ts` (§1) — every sitewide "Join the Beta"
button reads it, so the whole funnel opens (or re-closes) with one constant.

```
"Join the Beta"  ──BETA_CTA_HREF──▶  /sign-in   (open passwordless: magic link + Google,
                                                  account created on first use)
        │
        ▼  (main) layout routes a member with no meta.onboarding_completed
/onboarding  ──▶  /onboarding/beta   (cinematic beta induction, ADR-068)
        │
        ▼
real, building member
```

### 2.1 Parked: the waitlist (for the future gated phase)

The waitlist surface is **intact and reachable by direct link** — it is *parked*, not
deleted — and becomes the lead-capture front door again when the **gated weekly-cohort
phase** lands (AI admits a batch on a metric, with automated onboarding emails). Reviving
it is a routing change (point `BETA_CTA_HREF` back at `/beta`), not a rebuild.

```
/beta form  ──requestBetaAccess()──▶  contacts row
                                       source='beta_waitlist'
                                       consent_state='unknown'         (pending)
                                       meta.double_optin='pending'
                                       + queue confirm email (spine)
        │
        ▼  user clicks the email link
/beta/confirm?e=&t=  ──verifyBetaToken()──▶  consent_state='subscribed'
                                              meta.double_optin='confirmed'
        │
        ▼  admin admits in batches (/studio/beta)
admitBetaSignup()  ──▶  meta.beta_status='invited' + queue invite email (spine)
```

**Pieces (parked, still present)**
- `app/(marketing)/beta/actions.ts` — `requestBetaAccess` (validates, skips
  suppressed, upserts contact, queues confirm email).
- `app/(marketing)/beta/confirm/page.tsx` — verifies token, flips consent.
- `lib/beta-tokens.ts` — HMAC confirm tokens (mirrors `unsubscribe-tokens.ts`;
  secret = `BETA_CONFIRM_SECRET` → `UNSUBSCRIBE_SECRET` → service-key slice).
- `lib/email.ts` — `sendBetaConfirmEmail`, `sendBetaInviteEmail` (both **queued**
  through the spine, suppression-checked).
- No new tables — beta signups are `contacts` (status derived from
  `consent_state` + `meta`). `consent_state` values: `unknown | subscribed |
  unsubscribed` (the "pending" state lives in `meta.double_optin`).

---

## 3. Admin surfaces (two, deliberately)

**Studio** (`app/(studio)/`, staff-gated via `requireStaff`) — the operator cockpit
(CRM / email marketing / pipeline).
- Renders inside the **standard `AppShell`** (top header + profile card) but with a
  **Studio-only sidebar** — the member nav is hidden. `app/(studio)/layout.tsx` +
  `components/layout/studio-shell.tsx`. `AppShell` gained two additive optional
  props (member app unaffected): `extraSections` (the Studio nav) and `hideAppNav`
  (suppresses the member NAV_SECTIONS / Crew / Admin / Upgrade-CTA). The logo still
  links back to `/feed`; the profile card stays at the bottom.
- Reachable from the member app: staff see a **Studio** link in the sidebar's
  **Manage** section (below Admin). Gated on `isStaff` — the `(main)` layout
  computes it via `getStaffMember()` and passes it to `AppShell`.
- `/studio/beta` (`lib/studio/beta.ts`) — waitlist: stats, **Admit**, **Resend
  confirm**, and a **"Send queued emails now"** manual drain (see §4).
- `/studio/contacts` (`lib/studio/contacts.ts`) — filter tabs (All / Subscribers /
  Beta / Members) + **Unsubscribe / Resubscribe** (`setContactConsent`).

**Community admin** (`/admin/members`, janitor-gated) — the at-a-glance view.
- Tabbed: **Members · Subscribers · Beta invites**. Subscribers/Beta are read-only
  here and link to the Studio for actions.
- `@moderation` (a system profile, `is_system=true`, no login, used as the
  moderation-DM sender) is hidden from the People directory (`is_system` filter)
  and is intentionally not deletable.

---

## 4. Email queue & cron — operational note ⚠️

Every email is **queued** (never sent inline) and drained by
`/api/cron/process-queue` every 2 min, using the shared `lib/queue/handlers.ts`.

**`rejectUnauthorizedCron` is fail-closed.** If `CRON_SECRET` is **not set in
production, it rejects every cron call (incl. Vercel's own) → the queue never
drains → no emails send.** This is the #1 reason "emails aren't arriving."

Mitigations:
- **Set `CRON_SECRET`** (then Vercel auto-sends it with cron calls).
- Vercel **Hobby** runs crons once/day regardless of schedule — use **Pro** for the
  2-min cadence.
- Manual fallback: the **"Send queued emails now"** button on `/studio/beta`
  (`drainQueueNow` → `processQueue`, staff-gated), independent of the cron.

---

## 5. Required production env vars

| Var | Value | Why |
|---|---|---|
| `CRON_SECRET` | random 32+ char string | **Critical** — cron auth; without it nothing drains/sends |
| `RESEND_API_KEY` | Resend key | sending (already set) |
| `EMAIL_FROM` | verified sender, e.g. `Frequency <noreply@send.frequencylocal.com>` | deliverability (verify the `send.` subdomain in Resend — LAUNCH §4) |
| `NEXT_PUBLIC_SITE_URL` | `https://frequencylocal.com` | confirm/invite links, canonical, sitemap, OG |
| `NEXT_PUBLIC_APP_URL` | `https://frequencylocal.com` | email logo/footer links |
| `BETA_CONFIRM_SECRET` | random string (optional) | stable beta token signing (else falls back to service key) |
| `RESEND_WEBHOOK_SECRET` | from Resend dashboard | deliverability webhook (6.2) |

---

## 6. Deferred / not built

- **Support Us / donations / 501(c)(3) org-status framework** — spec'd (flip-ready
  `pre_501c3 → 501c3` wording, embedded donation widget, investor path = private
  contact). Held until the Foundation is incorporated.
- **Per-Nexus subdomains** (`encinitas.frequencylocal.com`) — model the data now
  (DNS-safe nexus slug + content scope tiers), build the routing when the first
  Nexus crystallizes.
- Branded sending-subdomain isolation (`send.` transactional / `news.` marketing).
