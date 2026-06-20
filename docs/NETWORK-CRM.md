# Profile Creator: Network Profiles

> **Status:** ✅ Built · ✅ migration applied to prod (`Frequency Community`) · ✅ AI harvest live (`platform_flags.ai_enabled = true`; toggle at `/admin/ai`, see [AI-CONTROLS.md](AI-CONTROLS.md)) · ✅ mobile quick-add (`+` → `/connections/new`, stewards/staff) · ⏳ full type regen deferred to merge-time (store uses the untyped admin handle) · gated to stewards (host+) / Studio staff.
> Source of truth: `supabase/migrations/20260606000000_network_contacts.sql`, `lib/connections/*`, `lib/ai/connections-ai.ts`, `app/(main)/connections/*`. Decision: [ADR-098](DECISIONS.md).

The Profile Creator lets a steward capture the people they meet: snap a business
card or poster, harvest the details, cut out a profile photo, and get a drafted
connection note + tags, or enter it by hand with Vera's help. Captures are
**owner-scoped and private by default**, with a deliberate path to promote them
into the wider network.

## Why a new entity

| Table | What it is | Why it doesn't fit |
|---|---|---|
| `profiles` | Real members (auth users), **public** read | A scanned lead isn't a member; public read would leak personal captures |
| `contacts` | Marketing list (consent, campaigns), service-role | No ownership / privacy axis; marketing-shaped |
| **`network_contacts`** *(new)* | Owned, private-by-default intake record | Purpose-built: ownership + visibility + sources + routing |

## Data model

`network_contacts`, the record:
- `owner_id` → `profiles(id)`: **the privacy primitive**. Every read/write is filtered on it.
- `visibility`: `private` (owner only) · `shared` (future: owner's team) · `network` (signed-in stewards). Gates promotion so personal captures don't bleed into public data.
- `source`: `card_scan` · `poster` · `manual` · `import` (the "many inputs").
- `status`: `new` · `active` · `archived` (routing/sorting).
- Harvested fields: `display_name, email, phone, title, company, city, website, socials(jsonb)`.
- `details(jsonb)`: the rich, flexible harvest of everything printed on the card: phones, emails, addresses, services, certifications, hours, links, other (all optional, validated by `coerceContactDetails`; mirrors `events.details`). Added by `20260614000000_contact_card_media.sql` (ADR-215).
- `avatar_path`: a key in the **private** `network-contacts` bucket (never a public URL; rendered via signed URL).
- `card_front_path` / `card_back_path`: the **deskewed card itself**, kept on file (private bucket, signed URLs). The client perspective-warps each side from the model's per-image corners (`lib/connections/deskew.ts`) before uploading the keepers to `{auth_uid}/{uuid}-front.jpg` / `-back.jpg`.
- `logo_path`: the cropped company logo (avatar fallback when there is no face; shown beside the company on the detail page).
- `extraction(jsonb)`: the raw AI harvest (audit / re-derive).
- `linked_profile_id` / `linked_contact_id`: the promotion hooks (scaffolded; own review).

`network_contact_notes`: the "space for notes" + the AI connection note (`kind`: `note` · `connection` · `ai`).
`network_contact_tags`: freeform owner-scoped tags (`source`: `manual` · `ai`), distinct from the governed `member_tags` registry.

## Gating & privacy

- **RLS:** owner CRUD on own rows; only `visibility='network'` rows are readable beyond the owner; notes/tags inherit the parent's ownership.
- **Storage:** the `network-contacts` bucket is `public=false`. Owner-folder RLS (`{auth_uid}/…`); the app mints short-lived **signed URLs** server-side to display. The temp OCR uploads are deleted after extraction; what stays on file is the cropped avatar, the cropped logo, and the deskewed card front/back the client uploads as keepers (ADR-215). Card images and `details` never appear in the network-shared view (`getSharedContact`), only on the owner's detail page.
- **Tool access (`lib/connections/access.ts`):** stewards (host+) **or** Studio staff (`team_members`). Records stay owner-scoped regardless of who has the tool.
- App enforces owner scoping in code on every query (admin handle) **and** via RLS as a backstop.

## The flow

```
Scan tab:   FRONT slot (+ optional BACK, + extra shots) → client resizes → upload temps
            → scanCard(paths, {hasBack}) → ONE Sonnet vision call (save_contact tool)
              → fields + note + tags + face box + logo box + per-image corners + quality + details
            → quality gate (retake note + "Use it anyway") when not legible / glare / skew
            → client deskews each side from its corners (canvas homography + light auto-contrast)
              and uploads the keepers ({uid}/{uuid}-front.jpg / -back.jpg)
            → avatar crop priority: face → logo → initials (logo also kept to logo_path)
            → prefill form (incl. editable details rows) → review → save
Manual tab: free text → veraAssist(text) → Haiku → same structured shape → prefill → review → save
            (Vera assist is optional; the form works fully by hand)
```

Both AI paths **degrade to plain manual entry** when AI is off, over budget, or a call fails.

## AI

- Goes through the kernel: `getAnthropic()` + the operator kill switch (`aiAvailable()`), per-feature daily caps (`featureOverBudget`), and the usage ledger (`recordAiUsage`).
- **Model tiering** (`lib/ai/models.ts`, [AI-STRATEGY](AI-STRATEGY.md)): vision OCR → **Sonnet** (`connection-scan`, cap $3/day); text assist → **Haiku** (`connection-assist`, cap $1/day). Not Opus per scan: that would blow the budget doctrine.
- Structured output via a **forced tool call** (`save_contact`), including a normalized face bounding-box. All output is re-validated by `coerceExtraction()` (`lib/connections/normalize.ts`) before it reaches the form, never trusted raw.
- Photo crop is pure client-side `<canvas>` geometry (`squareCropRect`): no server image library, no new dependency.

## Files

| Area | Path |
|---|---|
| Schema | `supabase/migrations/20260606000000_network_contacts.sql`, `20260614000000_contact_card_media.sql` |
| Types | `lib/connections/types.ts` |
| Pure helpers (+ tests) | `lib/connections/normalize.ts`, `normalize.test.ts` |
| Deskew (+ tests) | `lib/connections/deskew.ts`, `deskew.test.ts` |
| Details editor/view | `components/connections/contact-details-fields.tsx` |
| Store (owner-scoped, server-only) | `lib/connections/store.ts` |
| Access gate | `lib/connections/access.ts` |
| AI harvest | `lib/ai/connections-ai.ts` |
| Server actions | `app/(main)/connections/actions.ts` |
| List | `app/(main)/connections/page.tsx` |
| Creator (scan + manual/Vera) | `app/(main)/connections/new/` |
| Detail (notes, tags, status, edit) | `app/(main)/connections/[id]/` |
| Nav | `lib/nav-areas.ts` (`connections`), `components/layout/nav-icons.ts` |

## Operations

1. ✅ **Migration applied** (`20260606000000_network_contacts.sql`) to the `Frequency Community` project: 3 tables, RLS (owner-scoped), and the private `network-contacts` bucket. Verified: RLS on all 3, 6 table policies + 4 storage policies, bucket `public=false`. Security advisors: no new issues (only the project-wide `auth_allow_anonymous_sign_ins` WARN that every `auth.uid()` policy carries).
2. **Regenerate `lib/database.types.ts`**: *deferred to integration/merge-time* to avoid pulling other in-flight branches' prod schema into this feature branch. The store works today via the untyped admin handle (repo convention).
3. ✅ **AI harvest enabled**: `platform_flags.ai_enabled = true` (flipped + logged in `platform_flag_events`). Janitors can toggle it from **Admin → Platform → AI controls** (`/admin/ai`); the env still also needs `ANTHROPIC_API_KEY`. See [AI-CONTROLS.md](AI-CONTROLS.md).
4. ⏳ **Apply `20260614000000_contact_card_media.sql`** (additive, idempotent: `details` jsonb + `card_front_path` / `card_back_path` / `logo_path` on `network_contacts`). The detail/list reads select the new columns, so deploy the migration with (or before) the code.

> **Rollback** (additive, clean): `drop table public.network_contact_tags, public.network_contact_notes, public.network_contacts cascade;` then `delete from storage.buckets where id='network-contacts';` and drop the four `network-contacts: owner *` policies on `storage.objects`.

## Scan → shared CRM → invite → credit (ADR-099)

When a scanned contact has an email, on save it **also** lands in the shared Studio
CRM (`contacts`) as `source='scan_invite'`, `consent_state='unknown'` (added but
**never auto-subscribed**) and is linked via `linked_contact_id`. Optionally (a
per-scan checkbox) the steward sends **one** transactional intro.

| Piece | How |
|---|---|
| Shared-CRM lead | `lib/connections/crm-sync.ts`: upsert by `lower(email)`, never downgrades an existing member/subscriber |
| One-time intro | `lib/connections/invite.ts` → `sendScanIntroEmail` (`lib/email.ts`). Gated by `scan_invite_email_enabled` (**default off**) + the per-scan checkbox + `invited_at` guard |
| Points on join | The intro's CTA is the steward's **referral** link (`/q/<slug>`, ADR-091). Signup → `applyReferralAttribution` → `invite_accepted` zaps. Automatic |
| Legal unsubscribe | `/u/scan` (`lib/connections/lead-unsub.ts`, HMAC over `contacts.id`) → `consent_state='unsubscribed'`, RFC 8058 one-click. Non-member footer; set `COMPANY_POSTAL_ADDRESS` for CAN-SPAM |
| Operator switch | Marketing → Contacts toggle (`setScanInviteEnabled`, staff) → `platform_flags`, audited in `platform_flag_events`. Needs `RESEND_API_KEY` |

**Posture:** a single, person-initiated introduction (the steward met them), not bulk
marketing. No marketing email until the lead opts in (`consent_state='subscribed'`).

## Unified person: the "User Stats" page (ADR-130)

One human can exist as up to three rows joined by **lowercased email**: `profiles` (member),
`contacts` (the CRM hub), and `network_contacts` (0..n private captures). They are now pulled
together into a single operator view, and the people you have a real connection to are findable.

| Piece | How |
|---|---|
| Resolve a person | `lib/crm/person.ts#resolvePerson(contactId)`: gathers the `contacts` anchor + member `profile` + every capture with that email + the trail (`qr_scans`, `engagement_events`) + pipeline (`crm_deals`, `crm_activities`). Groups **by email at read time**, so it works before the backfill. |
| Auto-group (backfill) | `supabase/migrations/20260606170000_person_identity_stitch.sql` fills `contacts.profile_id`, `network_contacts.linked_contact_id`, `network_contacts.linked_profile_id` by email (idempotent; **✅ applied to `Frequency Community` 2026-06-05**, recorded `person_identity_stitch`). |
| User Stats page | `app/(main)/marketing/contacts/[id]` (DetailTemplate): stats + a **Grouped records** panel + **the path through the system**: one timeline grouped into funnel phases (Arrival → Outreach → In the app → CRM), built by the pure, tested `lib/crm/journey.ts`. The contacts list is searchable (`searchContacts`) and every row links here. |
| Invite to join | `app/(main)/marketing/contacts/[id]/actions.ts#inviteContactToJoin`: reuses the gated one-time scan-intro (ADR-099). No capturing steward ⇒ no intro to send, by design. |

### Searchable by connection + locality (not blanket exposure)

Members are searchable community-wide as before. A non-member **capture** surfaces in another
viewer's app-wide search **only** via one rule, `lib/crm/visibility.ts#canViewLead` (unit-tested):

- **`owner`**: the viewer captured them (scanned the card). The unambiguous valid connection.
- **`network_local`**: a steward set `visibility='network'` **and** the viewer shares the
  capture's locality (`city`). Locality + a deliberate share = connection.
- Captures already linked to a member are skipped (found via the member directory, never twice).

Wired surfaces: the header search overlay (`/api/search`) and the `/people` directory ("People
you've met"). **Owner** hits link to the steward's own `/connections/[id]`; **`network_local`**
hits link to a read-only shared view (`/connections/shared/[id]`).

**Cross-steward tier (ADR-132), now live, narrowly gated.** A `network_local` capture surfaces
only when *all* hold:
- the **viewer is a steward** (host+) or staff: leads aren't searched for regular members
  (`connectionsOwnerId()` gates `searchVisibleLeads(..., { includeNetwork: true })`);
- the owner **deliberately shared** the capture (`visibility='network'`, the Network/Private
  toggle on the connection); and
- the viewer is in the **same locality** (`city`).

What's exposed is **business-card only**: name, title, company, city, website, socials, and *who
shared it*. Email, phone, notes, tags and the photo stay owner-private, so the intro routes through
the capturing steward. The shared page re-checks all three gates server-side (it never trusts the
search filter): steward (`connectionsOwnerId`), `visibility='network'` (`getSharedContact`), and
locality (`canViewLead`). A capture that's become a member is skipped (you find them as a member).

### Operations

- ✅ **Migration applied**: `person_identity_stitch` (recorded version `20260605205151`) to
  `Frequency Community` on 2026-06-05. The idempotent backfill changed **0 rows** on current data
  (the scan and signup flows already set these links), and created the three lookup indexes
  (`network_contacts_linked_contact_idx`, `…_linked_profile_idx`, `…_network_city_idx`). Re-running
  is safe. Security advisors: **no new issues** (only the pre-existing project-wide warnings, e.g.
  `auth_allow_anonymous_sign_ins`).
- **Types:** no regen needed, additive indexes + a data backfill, no new columns. The crm/network
  tables still go through the untyped admin handle (repo convention).

## Not yet (deliberate follow-ups)

- **Promotion into public/network** (`→ contacts`, link to a member `profile`): schema hooks exist; the action is gated behind its own review since that's where leak risk concentrates.
- `shared` (team) visibility: modelled, not yet surfaced.
- More sources (email/calendar import): `source` is open for it.

---

# The Network rework (planned): member-facing IA + the event-capture loop

> **Decision: [ADR-154](DECISIONS.md).** Status: 📋 designed, not built. Reworks the
> Profile Creator from a host-only steward tool into a **member-facing "Network"** product
> (*manage the real-life people you meet*) and adds the missing **event-invite capture loop**.
> The data model (the three entities above) is unchanged; this is IA, an access-tier change,
> and one new public capture surface. Build items in
> [`ONBOARDING-BUILD-LIST.md`](ONBOARDING-BUILD-LIST.md) §5.

## In one line

People should make **real-life contacts**, and keep them. Rename **Directory → Network**,
fold *your personal contacts* into it as a **member** feature (today it's host-gated), and let
a member grow that library by **inviting people to events**: their custom QR opens an RSVP
contact form, and the new contact lands in the member's personal library, the event's guest
list, and the marketing DB, *with permission observed at every hop*.

## The three entities (unchanged) and the one privacy rule

| Entity | Whose | Read scope | Role |
|---|---|---|---|
| `profiles` | the platform | **public** | real members |
| `network_contacts` | **the member** (`owner_id`) | **private** (owner only; `network` opt-in) | your personal CRM |
| `contacts` | the platform | service-role | the marketing DB |

**The one rule (the "bleed" boundary):** a person a member captures stays **personal**. They
enter the **marketing** DB only as `consent_state` *unknown* (added, never mailed), and become
mailable (`subscribed`) **only when the person confirms an email or signs up for something at
Frequency**. Promotion `network_contacts → contacts` is the deliberate, consent-gated act
(ADR-099); it never happens silently.

## IA: the Network tab (two faces, member-tier)

`Directory` (`/people`) and `Profiles`/`Connections` (`/connections`) **merge under one rail
item: `Network`** (`lib/nav-areas.ts`, section **Community**, `defaultAccess: 'member'`).

| Face | What | Source | Who |
|---|---|---|---|
| **Directory** | the full searchable directory: members **+ people you've met** | `profiles` + your `network_contacts` + `canViewLead` | all members |
| **Contacts** (your library) | your personal CRM: scanned cards, posters, manual+Vera, event RSVPs | `network_contacts` (owner = you) | all members |

- **Tier change:** personal **Contacts** drop from host+/staff (ADR-098) to **member**. Safe:
  `network_contacts` is already owner-scoped by RLS; only the gate in `lib/connections/access.ts`
  moves. Every member gets a private contact library; the data boundary is untouched.
- **Stays steward-gated:** the **cross-steward `network_local` sharing** (ADR-132, surfacing a
  *shared* capture to other local stewards) remains host+. Members get their *own* contacts; they
  do **not** get to browse other people's captures.
- **Stays distinct:** the steward **`/crm`** (deals pipeline over `contacts`) and **Marketing →
  Contacts** (the marketing list) are unchanged. Network is the *personal* layer beneath them.

## The headline build: the event-invite capture loop

**The missing piece.** Today RSVP is members-only (`toggleRSVP`), and QR codes point at browse
pages. The loop the product is built around (*meet someone, invite them to your event, keep them
as a contact*) has no surface. Build it:

```
Member promotes an event → shares their attributed code  /q/<slug>  (owner + event stamped, ADR-091/099)
  → invitee scans in person
  → PUBLIC event RSVP contact form  (name · email · phone · socials · "how we met" note — all optional but encouraged)
  → on submit, ONE person, written to THREE places, consent observed:
       1. event guest list   → they RSVP'd to THIS event           (new: event_guests, per-event)
       2. owner's personal CRM → network_contacts (owner = inviter, source='event', linked_*)   ← "for their personal library"
       3. marketing DB        → contacts (source='event_rsvp', consent_state='unknown')          ← mailable only on opt-in
  → confirmation → soft prompt to finish their profile / join Frequency (the owner's referral converts)
```

- **Reuse, don't rebuild:** the attributed `/q/<slug>` referral primitive (ADR-091), the
  `network_contacts` write + `crm-sync.ts` upsert-by-email + the consent ladder (ADR-099), the
  `event_guest` acquisition-channel hint already scaffolded in `lib/qr/acquisition.ts`, and the
  AI harvest for the "how we met" note (`connections-ai.ts`).
- **New:** the **public RSVP capture form** (non-member, no auth, like `/onboarding/beta`'s
  deferred flow, exempted in `proxy.ts`, noindexed); a per-event **`event_guests`** list (a
  non-member can RSVP to one event without an account); the **triple-write** action carrying the
  owner attribution from the code.
- **Privacy at the door:** the form states what's shared. The contact info is the *invitee's* to
  give; the personal-library copy is the *inviter's*; the marketing copy is consent-`unknown`
  until they opt in. CAN-SPAM/RFC-8058 footer + `/u/scan`-style unsubscribe already exist.

## Vera: the contact-completion assist (mostly built)

The product promise (*snap a card / poster / the person, drop a note, Vera finishes the card*)
is **already live** (`lib/ai/connections-ai.ts`: Sonnet vision OCR + Haiku text assist → a
fully-structured contact + drafted connection note + tags, all re-validated). The rework just
**surfaces it to members** (quick-add `+` → capture) and points the same harvest at the event-RSVP
"how we met" note. Degrades to manual entry when AI is off.

## Gamification: reward the *real* connection, never the row

Ride the existing **zaps = real-life/outreach** currency (`lib/zaps.ts`, `lib/engagement/currency.ts`).
Guardrail (engine doctrine): pay for **real outcomes**, idempotent, daily-capped. *Adding a row is
not an outcome*.

| Moment | Reward | Anti-farm |
|---|---|---|
| Capture a contact (scan/manual) | small ⚡ "grew your network" | first N/day only; not per-row |
| Invitee **RSVPs** via your code | ⚡ (`event_guest`) | once per distinct invitee+event |
| Invitee **attends** | ⚡⚡ | gated on attendance check-in |
| Invitee **joins Frequency** | `invite_accepted` ⚡⚡ + 💎 (already pays, ADR-099) | referral attribution, idempotent |
| Milestone: 10 / 25 / 100 real contacts | **"Connector" achievement** + badge | counts linked/confirmed contacts, not raw rows |

Feeds the season **Zap** ladder (in-world doing → rank), and a Network stat on the member's
profile/dashboard ("people you've brought in"). Keeps Vera's doctrine: she nudges you to invite a
*real* person to a *real* event, not to chat.

## Reworked file map

| Piece | Path | State |
|---|---|---|
| Nav: `people`+`connections` → one `Network` (member) | `lib/nav-areas.ts`, `components/layout/nav-icons.ts` | 📋 |
| Access tier → member (keep cross-steward host+) | `lib/connections/access.ts` | 📋 |
| Network page (Directory + Contacts tabs) | `app/(main)/people/` ← merge `app/(main)/connections/` | 📋 |
| Member quick-add capture (`+` → scan/manual+Vera) | `app/(main)/connections/new/` (exists; ungate) | ⏳ exists, host-gated |
| Public event RSVP capture form | new `app/events/[slug]/rsvp/` (no-auth, proxy-exempt) | 📋 |
| `event_guests` (per-event, non-member RSVP) | new migration | 📋 |
| Triple-write action (guest + network_contact + contact) | new, reuses `crm-sync.ts` | 📋 |
| Owner+event attribution on the code | `lib/qr/codes.ts` (`event` type exists), `app/q/[slug]` | ⏳ extend |
| Gamification hooks | `lib/zaps.ts`, `lib/engagement/currency.ts`, achievements catalog | 📋 |
