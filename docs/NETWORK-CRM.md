# Profile Creator — Network Profiles

> **Status:** ✅ Built · ✅ migration applied to prod (`Frequency Community`) · ✅ AI harvest live (`platform_flags.ai_enabled = true`; toggle at `/admin/ai` — see [AI-CONTROLS.md](AI-CONTROLS.md)) · ✅ mobile quick-add (`+` → `/connections/new`, stewards/staff) · ⏳ full type regen deferred to merge-time (store uses the untyped admin handle) · gated to stewards (host+) / Studio staff.
> Source of truth: `supabase/migrations/20260606000000_network_contacts.sql`, `lib/connections/*`, `lib/ai/connections-ai.ts`, `app/(main)/connections/*`. Decision: [ADR-097](DECISIONS.md).

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

## Not yet (deliberate follow-ups)

- **Promotion into public/network** (`→ contacts`, link to a member `profile`) — schema hooks exist; the action is gated behind its own review since that's where leak risk concentrates.
- `shared` (team) visibility — modelled, not yet surfaced.
- More sources (email/calendar import) — `source` is open for it.
