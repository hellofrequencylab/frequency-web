# Marketing site, Beta funnel & Studio operations

The public front door + the beta acquisition funnel + the admin surfaces for
managing it. Built on the existing email spine (ADR-026) and the `contacts` CRM
(6.3). This is the acquisition layer; [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md)
covers the engine underneath.

> Status: shipped + live on `go.findafreq.com`. The apex `findafreq.com` is still
> Squarespace — see "Deferred" below.

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
| `/beta`, `/beta/confirm` | `app/(marketing)/beta/*` | The acquisition funnel (§2) |
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
  (`/beta`), `SITE_URL`, `ORG_LEGAL_NAME`, `CONTACT_EMAIL`.
- Imagery: `public/images/site/` (pulled from the old Squarespace, optimized).
- **No em dashes** in marketing copy (house rule).

---

## 2. Beta acquisition funnel — double opt-in

No gated signup (open signup still lives at `/sign-in`). "Join the Beta" is a
**featured lead-capture with double opt-in** that lands people in the CRM.

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

**Pieces**
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

**Studio** (`app/(studio)/`, staff-gated via `requireStaff`) — the operator cockpit.
- Renders inside the **standard `AppShell`** (top header + left sidebar) with a
  "Studio" nav section. `app/(studio)/layout.tsx` + `components/layout/studio-shell.tsx`.
  `AppShell` gained an additive optional `extraSections` prop — member app unaffected.
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
| `EMAIL_FROM` | verified sender, e.g. `Frequency <noreply@findafreq.com>` | deliverability (SPF/DKIM/DMARC on that domain) |
| `NEXT_PUBLIC_SITE_URL` | `https://go.findafreq.com` | confirm/invite links, canonical, sitemap, OG |
| `NEXT_PUBLIC_APP_URL` | `https://go.findafreq.com` | email logo/footer links |
| `BETA_CONFIRM_SECRET` | random string (optional) | stable beta token signing (else falls back to service key) |
| `RESEND_WEBHOOK_SECRET` | from Resend dashboard | deliverability webhook (6.2) |

---

## 6. Deferred / not built

- **Support Us / donations / 501(c)(3) org-status framework** — spec'd (flip-ready
  `pre_501c3 → 501c3` wording, embedded donation widget, investor path = private
  contact). Held until the Foundation is incorporated.
- **`findafreq.com` apex cutover** — point apex DNS at Vercel, set it primary,
  flip `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL`, add to Supabase Auth redirect
  URLs, 301 `go.` → apex, cancel Squarespace.
- **Per-Nexus subdomains** (`encinitas.findafreq.com`) — model the data now
  (DNS-safe nexus slug + content scope tiers), build the routing when the first
  Nexus crystallizes.
- Branded sending-subdomain isolation (`send.` transactional / `news.` marketing).
