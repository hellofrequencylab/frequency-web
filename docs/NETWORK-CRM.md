# Profile Creator — Network Profiles

> **Status:** ✅ Built · ✅ migration applied to prod (`Frequency Community`) · ✅ AI harvest live (`platform_flags.ai_enabled = true`; toggle at `/admin/ai` — see [AI-CONTROLS.md](AI-CONTROLS.md)) · ✅ mobile quick-add (`+` → `/connections/new`, stewards/staff) · ⏳ full type regen deferred to merge-time (store uses the untyped admin handle) · gated to stewards (host+) / Studio staff.
> Source of truth: `supabase/migrations/20260606000000_network_contacts.sql`, `lib/connections/*`, `lib/ai/connections-ai.ts`, `app/(main)/connections/*`. Decision: [ADR-098](DECISIONS.md).

The Profile Creator lets a steward capture the people they meet — snap a business
card or poster, harvest the details, cut out a profile photo, and get a drafted
connection note + tags — or enter it by hand with Vera's help. Captures are
**owner-scoped and private by default**, with a deliberate path to promote them
into the wider network.

## Why a new entity

| Table | What it is | Why it doesn't fit |
|---|---|---|
| `profiles` | Real members (auth users), **public** read | A scanned lead isn't a member; public read would leak personal captures |
| `contacts` | Marketing list (consent, campaigns), service-role | No ownership / privacy axis; marketing-shaped |
| **`network_contacts`** *(new)* | Owned, private-by-default intake record | Purpose-built: ownership + visibility + sources + routing |

## Data model

`network_contacts` — the record:
- `owner_id` → `profiles(id)` — **the privacy primitive**. Every read/write is filtered on it.
- `visibility` — `private` (owner only) · `shared` (future: owner's team) · `network` (signed-in stewards). Gates promotion so personal captures don't bleed into public data.
- `source` — `card_scan` · `poster` · `manual` · `import` (the "many inputs").
- `status` — `new` · `active` · `archived` (routing/sorting).
- Harvested fields: `display_name, email, phone, title, company, city, website, socials(jsonb)`.
- `avatar_path` — a key in the **private** `network-contacts` bucket (never a public URL; rendered via signed URL).
- `extraction(jsonb)` — the raw AI harvest (audit / re-derive).
- `linked_profile_id` / `linked_contact_id` — the promotion hooks (scaffolded; own review).

`network_contact_notes` — the "space for notes" + the AI connection note (`kind`: `note` · `connection` · `ai`).
`network_contact_tags` — freeform owner-scoped tags (`source`: `manual` · `ai`), distinct from the governed `member_tags` registry.

## Gating & privacy

- **RLS:** owner CRUD on own rows; only `visibility='network'` rows are readable beyond the owner; notes/tags inherit the parent's ownership.
- **Storage:** the `network-contacts` bucket is `public=false`. Owner-folder RLS (`{auth_uid}/…`); the app mints short-lived **signed URLs** server-side to display. Original scans are deleted after extraction — only the cropped avatar is kept.
- **Tool access (`lib/connections/access.ts`):** stewards (host+) **or** Studio staff (`team_members`). Records stay owner-scoped regardless of who has the tool.
- App enforces owner scoping in code on every query (admin handle) **and** via RLS as a backstop.

## The flow

```
Scan tab:   capture/upload → client resizes → upload to private bucket
            → scanCard(path) → Sonnet vision (save_contact tool) → fields + note + tags + face box
            → client crops avatar on <canvas> from the box → upload cropped → prefill form → review → save
Manual tab: free text → veraAssist(text) → Haiku → same structured shape → prefill → review → save
            (Vera assist is optional; the form works fully by hand)
```

Both AI paths **degrade to plain manual entry** when AI is off, over budget, or a call fails.

## AI

- Goes through the kernel: `getAnthropic()` + the operator kill switch (`aiAvailable()`), per-feature daily caps (`featureOverBudget`), and the usage ledger (`recordAiUsage`).
- **Model tiering** (`lib/ai/models.ts`, [AI-STRATEGY](AI-STRATEGY.md)): vision OCR → **Sonnet** (`connection-scan`, cap $3/day); text assist → **Haiku** (`connection-assist`, cap $1/day). Not Opus per scan — that would blow the budget doctrine.
- Structured output via a **forced tool call** (`save_contact`), including a normalized face bounding-box. All output is re-validated by `coerceExtraction()` (`lib/connections/normalize.ts`) before it reaches the form — never trusted raw.
- Photo crop is pure client-side `<canvas>` geometry (`squareCropRect`) — no server image library, no new dependency.

## Files

| Area | Path |
|---|---|
| Schema | `supabase/migrations/20260606000000_network_contacts.sql` |
| Types | `lib/connections/types.ts` |
| Pure helpers (+ tests) | `lib/connections/normalize.ts`, `normalize.test.ts` |
| Store (owner-scoped, server-only) | `lib/connections/store.ts` |
| Access gate | `lib/connections/access.ts` |
| AI harvest | `lib/ai/connections-ai.ts` |
| Server actions | `app/(main)/connections/actions.ts` |
| List | `app/(main)/connections/page.tsx` |
| Creator (scan + manual/Vera) | `app/(main)/connections/new/` |
| Detail (notes, tags, status, edit) | `app/(main)/connections/[id]/` |
| Nav | `lib/nav-areas.ts` (`connections`), `components/layout/nav-icons.ts` |

## Operations

1. ✅ **Migration applied** (`20260606000000_network_contacts.sql`) to the `Frequency Community` project — 3 tables, RLS (owner-scoped), and the private `network-contacts` bucket. Verified: RLS on all 3, 6 table policies + 4 storage policies, bucket `public=false`. Security advisors: no new issues (only the project-wide `auth_allow_anonymous_sign_ins` WARN that every `auth.uid()` policy carries).
2. **Regenerate `lib/database.types.ts`** — *deferred to integration/merge-time* to avoid pulling other in-flight branches' prod schema into this feature branch. The store works today via the untyped admin handle (repo convention).
3. ✅ **AI harvest enabled** — `platform_flags.ai_enabled = true` (flipped + logged in `platform_flag_events`). Janitors can toggle it from **Admin → Platform → AI controls** (`/admin/ai`); the env still also needs `ANTHROPIC_API_KEY`. See [AI-CONTROLS.md](AI-CONTROLS.md).

> **Rollback** (additive, clean): `drop table public.network_contact_tags, public.network_contact_notes, public.network_contacts cascade;` then `delete from storage.buckets where id='network-contacts';` and drop the four `network-contacts: owner *` policies on `storage.objects`.

## Scan → shared CRM → invite → credit (ADR-099)

When a scanned contact has an email, on save it **also** lands in the shared Studio
CRM (`contacts`) as `source='scan_invite'`, `consent_state='unknown'` — added but
**never auto-subscribed** — and is linked via `linked_contact_id`. Optionally (a
per-scan checkbox) the steward sends **one** transactional intro.

| Piece | How |
|---|---|
| Shared-CRM lead | `lib/connections/crm-sync.ts` — upsert by `lower(email)`, never downgrades an existing member/subscriber |
| One-time intro | `lib/connections/invite.ts` → `sendScanIntroEmail` (`lib/email.ts`). Gated by `scan_invite_email_enabled` (**default off**) + the per-scan checkbox + `invited_at` guard |
| Points on join | The intro's CTA is the steward's **referral** link (`/q/<slug>`, ADR-091). Signup → `applyReferralAttribution` → `invite_accepted` zaps. Automatic |
| Legal unsubscribe | `/u/scan` (`lib/connections/lead-unsub.ts`, HMAC over `contacts.id`) → `consent_state='unsubscribed'`, RFC 8058 one-click. Non-member footer; set `COMPANY_POSTAL_ADDRESS` for CAN-SPAM |
| Operator switch | Marketing → Contacts toggle (`setScanInviteEnabled`, staff) → `platform_flags`, audited in `platform_flag_events`. Needs `RESEND_API_KEY` |

**Posture:** a single, person-initiated introduction (the steward met them), not bulk
marketing. No marketing email until the lead opts in (`consent_state='subscribed'`).

## Unified person — the "User Stats" page (ADR-127)

One human can exist as up to three rows joined by **lowercased email**: `profiles` (member),
`contacts` (the CRM hub), and `network_contacts` (0..n private captures). They are now pulled
together into a single operator view, and the people you have a real connection to are findable.

| Piece | How |
|---|---|
| Resolve a person | `lib/crm/person.ts#resolvePerson(contactId)` — gathers the `contacts` anchor + member `profile` + every capture with that email + the trail (`qr_scans`, `engagement_events`) + pipeline (`crm_deals`, `crm_activities`). Groups **by email at read time**, so it works before the backfill. |
| Auto-group (backfill) | `supabase/migrations/20260606170000_person_identity_stitch.sql` fills `contacts.profile_id`, `network_contacts.linked_contact_id`, `network_contacts.linked_profile_id` by email (idempotent; **written, applied in a separate reviewed step**). |
| User Stats page | `app/(main)/marketing/contacts/[id]` (DetailTemplate): stats + a **Grouped records** panel + **the path through the system** — one timeline grouped into funnel phases (Arrival → Outreach → In the app → CRM), built by the pure, tested `lib/crm/journey.ts`. The contacts list is searchable (`searchContacts`) and every row links here. |
| Invite to join | `app/(main)/marketing/contacts/[id]/actions.ts#inviteContactToJoin` — reuses the gated one-time scan-intro (ADR-099). No capturing steward ⇒ no intro to send, by design. |

### Searchable by connection + locality (not blanket exposure)

Members are searchable community-wide as before. A non-member **capture** surfaces in another
viewer's app-wide search **only** via one rule — `lib/crm/visibility.ts#canViewLead` (unit-tested):

- **`owner`** — the viewer captured them (scanned the card). The unambiguous valid connection.
- **`network_local`** — a steward set `visibility='network'` **and** the viewer shares the
  capture's locality (`city`). Locality + a deliberate share = connection.
- Captures already linked to a member are skipped (found via the member directory, never twice).

Wired surfaces — the header search overlay (`/api/search`) and the `/people` directory ("People
you've met") — show **owner** leads today (they link to the steward's own `/connections/[id]`).
`network_local` is modeled and tested but **not broadcast** yet: a non-owner viewer has no lead
page to land on, and cross-steward exposure rides the same promotion-review gate as below.

## Not yet (deliberate follow-ups)

- **Cross-steward `network_local` search** — `canViewLead` supports it and it's tested, but it's
  not surfaced until the promotion review + a viewer-facing lead page exist (leak risk).
- **Promotion into public/network** (`→ contacts`, link to a member `profile`) — schema hooks exist; the action is gated behind its own review since that's where leak risk concentrates.
- `shared` (team) visibility — modelled, not yet surfaced.
- More sources (email/calendar import) — `source` is open for it.
