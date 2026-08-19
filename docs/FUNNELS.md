# Funnels: the sign-up front door

Status: **live.** Decisions: [DECISIONS.md ADR-068](DECISIONS.md) (the induction), [ADR-162](DECISIONS.md)
(DB-authored Funnels), [ADR-617](DECISIONS.md) (styles), [ADR-619](DECISIONS.md) (feature Funnels),
[ADR-1088](DECISIONS.md) (the oath removed), [ADR-1090](DECISIONS.md) (the Funnels name + the /join
move — this doc's rename from BETA-INDUCTION.md). Voice: [AI-VERA.md](AI-VERA.md) (hot register, §2).
Naming: [NAMING.md §Funnels](NAMING.md).

## What it is, in one line

**Funnels** are focused sign-up funnels, one per niche or audience: a shareable splash at
`/join/<slug>`, a short cinematic induction at `/join`, and a durable cohort tag — the whole
walk from stranger to created account, guided by scripted Vera. The owner's framing (ADR-1090):
*"These are supposed to be focused funnels for building out any niche and getting a sign up."*

This feature began life as the "beta induction" (ADR-068), a throwaway founding-cohort flow.
ADR-1090 retired that framing: Funnels are the product's sign-up platform and its ONLY front
door — there is no separate `/sign-up` route. What remains genuinely beta-scoped is the Beta
*program* (free Crew via `BETA_MEMBERS_GET_CREW`, the `/beta` marketing page), not this machinery.

## Why it blocks (on purpose)

| | Funnels induction (this doc) | Steady-state onboarding (ADR-047) |
|---|---|---|
| Who | Every visitor signing up | Every signed-up member afterwards |
| Shape | Short guided sequence, one focus per beat | Progressive, non-blocking coachmarks |
| Why it blocks at all | It IS the sign-up: the account does not exist until the last beat | Members must explore freely |
| Vera | **Hot** register, scripted | Cool register, eventually live |

The induction is the live sign-up path behind one flag: `FUNNEL_INDUCTION_ACTIVE` in
`lib/onboarding/funnel-script.ts`. While it is `true`, `/onboarding` redirects into `/join`, and
`app/(main)/layout.tsx` routes any signed-in user whose `meta.onboarding_completed` is not `true`
to `/onboarding` (no loop: `/onboarding` is outside the `(main)` layout). Flipping the flag off
falls back to the ADR-047 non-blocking model.

## One template, audience-targeted Funnels ([ADR-1051](DECISIONS.md) → ADR-162/617)

A **Funnel** bundles a **splash**, the induction's **voiced copy** (`VeraCopy`), a **style**
(onboarding / feature / demographic — `lib/funnels/styles.ts`), a completion **destination**, and
a durable **marketing tag**:

| Slug | What it is | Authored where | Entry |
|---|---|---|---|
| `beta-default` *(reserved — a stored key, see below)* | The base VERA flow: what `/join` runs with no `?seq` (tag `beta_early_adopter`, cohort continuity) | `/pages/splash` live-preview editor → `sequence_overrides` | `/join` |
| `breathwork` *(code)* | The feature Funnel (ADR-619): play the box-breath visualizer, sign up to keep the streak | `lib/funnels/definitions.ts` | `/join/breathwork` |
| any other slug | A DB-built Funnel for a specific audience | `/pages/sequences` wizard → `sequence_overrides` | `/join?seq=<slug>` |

`resolveFunnel(null \| '' \| 'beta-default')` returns the coded VERA script merged with the legacy
`/admin/vera` induction tweaks and then the `beta-default` override (the editor's saved copy wins).
The public `/join/<slug>` splash renders only for CODE Funnels; a DB-built Funnel's audience enters
straight at its induction link. `/join/<slug>` also still serves the Circle invite-redemption page
when the slug is an `invite_links` token — one dynamic segment, two doors, dispatched in
`app/join/[slug]/page.tsx` (Funnel slugs win; anything else resolves as a token or 404s). The slugs
`complete` and `preview` are reserved (static /join siblings); the builder refuses them.

**How it flows.** The link carries the audience into the induction via `?seq=`; a 30-day
`fq_beta_seq` cookie (stored name — see below) keeps it across the deferred sign-in round-trip. On
completion `writeInduction` records `meta.beta.sequence` and stamps the cohort's marketing tag
(resolved through the DB layer, best-effort; never blocks). Tags are governed, declared in
`lib/traits/registry.ts` (snake_case), and `assignTag` refuses unregistered keys so every cohort
stays segmentable by entry path forever.

**Grants.** A Funnel can confer a one-time grant on every account that finishes it
(`FUNNEL_GRANTS` in `lib/funnels/definitions.ts`, keyed by slug): comp Crew, Founding Member
status, or a Zap welcome bonus. Applied server-side at completion (`applyFunnelGrants`),
idempotent, best-effort.

**Authoring.** The default flow's copy is edited in the janitor-only **Default Funnel** editor at
`/pages/splash` (left: every beat's strings; right: the REAL `<FunnelInduction>` rendered live in
preview mode). Audience Funnels are built at `/pages/sequences` (the **Funnels** manager). Beat
headings support a light accent markup: a word wrapped in `*asterisks*` renders in the brand accent.

## Stored keys deliberately keep their beta_ names (ADR-1090)

The rename is a CODE and URL rename. Everything persisted keeps its original identifier, because
it is data already written to members, rows, and browsers (the `beta_audit_log` convention):

- `beta-default` — the reserved default-Funnel slug (a `sequence_overrides` row + every
  `meta.beta.sequence` stamp). New saves keep writing it.
- `beta_*` marketing tags (`beta_early_adopter`, `beta_breathwork`, `beta_<slug>` for new
  Funnels) — one cohort must stay one segment across the rename, so NEW Funnels keep minting
  the prefix too.
- `profiles.meta.beta.*` — the completion record (version / intent / heard_about / location /
  sequence / completed_at).
- `fq_beta_seq` + `fq_beta_entry_*` — cookies/localStorage already in browsers mid-flight.
- `signup_leads.source = 'beta_induction'`, `contacts.source = 'onboarding_beta'` — stored row
  values.
- The `sequence_overrides` **table** — every authored Funnel lives in it.

## URLs (and where the old ones went)

| Route | Serves | Old URL (308s here) |
|---|---|---|
| `/join` | The induction: default Funnel, or `?seq=<slug>` for an audience Funnel; `?persona=`, `?next=` honoured | `/onboarding/beta` |
| `/join/<slug>` | A code Funnel's splash, or a Circle invite token | `/beta/<slug>` (splashes) |
| `/join/complete` | Deferred completion landing (post sign-in) | `/onboarding/beta/complete` |
| `/join/preview` | Public no-auth visual preview | `/onboarding/beta/preview` |

`/beta` (the "Join the Beta" marketing page) did not move: it is about the Beta *program* and now
points its CTAs at `/join`. All /join routes are noindex (robots.ts disallows the segment; the
splash also sets per-page noindex, the same intent the old routes carried).

## Look & feel: a cinematic sequence, not a form

The whole thing is **centered, one focus per screen** (Hook-style), large display type, a single
pill action per beat (no marketing-style button rows), and minimal centered inputs, deliberately
*not* a labeled form. It **starts dark and lightens beat by beat**: a `bg-ink` scrim over the light
`canvas` base lifts its opacity each step (`SCENES` in `induction.tsx`) until the final beat lands on
the **feed's light theme**; text flips light-on-dark → dark-on-light in step, masked by the per-beat
fade-in. A blurred `primary`/`signal` radial glow rides behind it. The whole `/join` flow is pinned
to light mode (the `(induction)` route-group layout).

The spine is **the reel** (beat 1): a crossfading slideshow of the **vector feature renders**
(Feed → Circles → Events) only, no photography. It's data-driven (`REEL` in
`lib/onboarding/funnel-script.ts`); the `ReelSlide` type still supports `kind:'image'`, so a real
product **screenshot** can be slotted in later by adding an entry, no component changes.

## The flow: 4 beats, < 90 seconds

`BEAT_COUNT` in `induction.tsx` is the ONE number the progress bar, the `Step N of M`
live-region label, and the `initialBeat` clamp all read, so the sequence length is a
single edit. Beats are 0-indexed in code and 1-indexed on screen.

| # | Beat | Vera register | Captures | Blocking? |
|---|---|---|---|---|
| 0 | **Welcome**: who they are (persona fork, or a niche Funnel's 4 cards) + an optional email | Hot | `meta.persona(s)`, a `signup_leads` row | skippable |
| 1 | **The reel**: crossfading vector renders (auto-advancing), or a niche Funnel's 3 core features | Hot | the core-feature pick (lead payload) | skippable |
| 2 | **Your profile**: name · handle · photo · city | Cool | `display_name`, `handle`, `avatar_url`, `meta.beta.location` | name+handle req'd |
| 3 | **Step in**: sign in (deferred) or "Enter Frequency" (authed) | Hot | writes all + `meta.onboarding_completed` | ✅ the account is created here |

Name + handle are required to enter (a profile can't function without them); photo, city,
email, and persona are optional but asked for plainly. The reel auto-advances (paused under
`prefers-reduced-motion`) with clickable dots. Everything persists only on the final **Step in**.

**There is no oath** (ADR-1088). The three commitment checkboxes that used to open the flow are
removed: this is a sign-up funnel for any niche, and a ceremony in front of the sign-up is friction
with no conversion behind it. Historical `meta.beta.oath` values are left where they are.

## Data: the finished profile rides `profiles.meta`; the unfinished one rides `signup_leads`

The completed induction needs no migration. Everything it writes rides the existing
`profiles.meta` JSONB (same call as ADR-047's `meta.tour`):

```jsonc
meta = {
  onboarding_completed: true,        // set on Enter; returning users skip the induction
  beta: {                            // stored key — kept through the Funnels rename
    version: 1,
    intent: "free-text: what they're hoping for",   // ← the CRM gold
    heard_about: "Instagram",                        // attribution for the funnel
    completed_at: "…"
  }
}
```

- The Enter action **merges** into existing `meta` (never blind-overwrites, unlike the legacy
  `completeOnboarding`, which is fine because it runs on a fresh `{}`).
- **CRM mirror is a follow-up:** `meta.beta.intent` is the seed for both the CRM `contacts.meta`
  timeline and (when it ships) `ai_member_context.facts.goals` / Vera's `suggest_circle`. Not wired
  in this build, documented so it isn't lost.

### The unfinished induction: `signup_leads` ([ADR-959](DECISIONS.md))

The deferred flow runs signed out, so until the very last beat the ONLY record of a visitor was
`fq_pending_induction`, a **one-hour** httpOnly cookie. Someone who answered three beats and was
interrupted left no trace and could not be followed up. Beat 0 now asks for an email beside its
continue button (optional; nobody is stopped from touring), and that opens a `signup_leads` row.
`step_reached` is 1-based on the funnel's own beats:

| Beat | Action | Effect |
|---|---|---|
| 0 · Welcome | `captureLead` (step 1) | Upserts on `lower(email)`, parks the row id in the 30-day httpOnly `fq_lead` cookie |
| 1 · The tour | `updateLead` (step 2) | Records progress + the niche Funnel's core-feature pick |
| 2 · Your profile | `updateLead` (step 3) | Folds in name, handle, city |
| 3 · Step in (deferred) | `captureLead` (step 4) | The sign-in address, which may be the first one given |
| Completion | `markLeadConverted` | Stamps `converted_profile_id` + `converted_at`, then consumes `fq_lead` |

Actions live in `app/join/(induction)/lead-actions.ts`; all five calls are best-effort and never
block the flow. The follow-up this enables is **transactional** ("finish setting up your account"),
so nothing here records or implies marketing consent, which stays on `contacts.consent_state`
behind the `/subscribe` double opt-in. The table is fail-closed to anon (RLS on, no policy); writes
go through three SECURITY DEFINER functions, and the capture returns a bare uuid so it cannot be
used to test whether an address is already registered. The recovery job that actually sends the
note is not built yet.

## Vera: scripted now, live later

- **Now:** every beat's copy is deterministic, in Vera's **hot register** (AI-VERA.md §2): conviction
  pointed at something real, never confetti. Zero AI calls ⇒ no kernel/kill-switch dependency.
- **Later:** when live Vera lands (ADR-066 Phase D), she delivers these beats conversationally and
  this script becomes her deterministic fallback. The beat structure does not change.

## The renders

The "vector renders" of each section are **inline SVG components**, not commissioned art:
`components/onboarding/renders/{feed,circles,events}-render.tsx`.

- DAWN tokens only (`fill="var(--brand)"`, `text-primary`, …): theme + brand-color for free, no hex.
- Animated with the existing `slideUp` keyframe + CSS transitions; **respect `prefers-reduced-motion`**.
- **Only the core triad** (Feed/Circles/Events): showing all 18 nav areas would violate "quick."
- Cheap to replace: swapped in the same PR as the flow when the design changes.

The reel is **renders only** (no photography); they crossfade on a timer. To add a real product
**screenshot** later, drop the file in `public/` and add a `kind:'image'` entry to `REEL` (the type
still supports it), no component changes.

## Accessibility & UX rules (the "do everything" checklist)

✅ Nothing blocks but the sign-up itself · ✅ < 90s, visible progress · ✅ once-per-user + resumable
(idempotent `meta` flag; returning users redirect to `/feed`) · ✅ keyboard + focus management on
each beat · ✅ `prefers-reduced-motion` honored by every render · ✅ mobile-first (the desktop brand
rail collapses) · ✅ ends on a real next step: **hands off to the Vera concierge** (`/onboarding/vera`,
ADR-074) who bridges them to a first circle, with a one-tap escape to `/circles` and a feed first-run
banner catching anyone who skips — or, for a niche Funnel, admits straight into its target section
(`funnelLanding`, `lib/funnels/destination.ts`) · ✅ Vera's voice, hot but earned.

## Success metrics

Induction completion rate + drop-off per beat, % who set a photo, % who answer the
intent question (CRM fill rate), and time-to-complete. Per-Funnel entered/captured events are
live (`onboarding.funnel_entered`, ADR-617 Phase 1); the bounce dashboard is pending
(SPLASH-FUNNELS.md).

## Files

| Path | Role |
|---|---|
| `app/join/(induction)/page.tsx` | Server page: auth guard, resolve the Funnel, fetch profile + regions |
| `app/join/(induction)/preview/page.tsx` | **Public, no-auth visual preview** (`/join/preview`): sample data, no writes; noindexed |
| `app/join/(induction)/induction.tsx` | Client flow: 4 beats (`preview` prop mocks the auth-dependent calls) |
| `app/join/(induction)/feature-funnel.tsx` | The feature-Funnel renderer (ADR-619): playable demo + the same deferred signup |
| `app/join/(induction)/actions.ts` | `completeInduction`, `stashPendingInduction`; reads the `?seq` cookie → records `meta.beta.sequence` + stamps the cohort tag + applies grants |
| `app/join/(induction)/complete/` | Deferred completion landing (`/join/complete`) |
| `app/join/[slug]/page.tsx` | `/join/<slug>` dispatcher: code-Funnel splash OR Circle invite token |
| `lib/onboarding/funnel-script.ts` | Vera's scripted copy, `FUNNEL_INDUCTION_ACTIVE` flag, the `VeraCopy` type |
| `lib/funnels/definitions.ts` | The `Funnel` shape, `FUNNELS` (code Funnels), `DEFAULT_FUNNEL`, destinations, `FUNNEL_GRANTS` |
| `lib/funnels/resolve.ts` | Merges code base + vera_config + `sequence_overrides` (server-only) |
| `lib/funnels/overrides.ts` | The `sequence_overrides` DB layer (stored table name) |
| `lib/funnels/styles.ts` | The Funnel STYLE registry (ADR-617) |
| `lib/funnels/destination.ts` | Safe-path validation for completion destinations |
| `app/(main)/pages/splash/` | **Default Funnel** editor (the `beta-default` override, live preview) |
| `app/(main)/pages/sequences/` | **Funnels** manager: create, build, publish, share link + QR |
| `components/onboarding/renders/{feed,circles,events}-render.tsx` | Section renders |
| `app/onboarding/page.tsx` | Redirects to `/join` while the flag is on |

## If the induction ever comes down

The old teardown-at-launch plan (delete everything, ADR-068) is superseded: Funnels are the
sign-up platform, and any future front-door change replaces them WITH something (see backlog row
OWN-030's history — the front door must never be removed alone). What stays true regardless:
`meta.beta.*` data and the `beta_*` cohort tags are durable history and are never deleted.
