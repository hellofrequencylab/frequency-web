# WhatsApp chat import

Turn a community WhatsApp group's exported history into reviewable **events** and
**housing listings**. Built for an admin who runs a large group (the housing group that
maxed out at 1025) and wants its listings and local healing events on the platform
without retyping them.

> **Status (this PR):** the safe foundation — parser, redactor, AI classifier/extractor,
> and a **read-only dry-run** admin surface. Nothing is written to the database yet. The
> writer (create event draft / list housing) is a deliberate follow-up, gated behind
> operator review of the dry run. See [Roadmap](#roadmap).

## Why export, not scrape

WhatsApp group history is end-to-end encrypted and has **no read API**. The Cloud /
Business API only sends and receives on your own number; it cannot read an existing
group's backlog. The only ways to "scrape" are automation tools (whatsapp-web.js,
Baileys, Selenium against WhatsApp Web) that drive a logged-in session — they violate
WhatsApp's Terms and **risk banning the number**, which for a community admin is a
catastrophic trade.

So we don't scrape. WhatsApp's built-in **Export chat** (group info → Export chat →
*Without media*) produces a `.txt` the admin downloads from the app. No automation ever
touches WhatsApp's servers, so no number — main or throwaway — is ever at risk. That
`.txt` is the importer's input.

## Pipeline

```
export .txt ──▶ parseWhatsAppExport ──▶ classifiableMessages ──▶ classifyAndExtract ──▶ ImportPreview
              (pure, deterministic)      (drop noise/system)      (AI, budget-gated)     (operator review)
```

### 1. Parser — `lib/whatsapp/parse-export.ts`

`parseWhatsAppExport(text): ParsedExport`. Pure, never throws. Handles:

- **Both OS formats.** iOS brackets the timestamp (`[2024-01-15, 10:23:45 PM] Name: …`);
  Android uses a ` - ` separator (`1/15/24, 10:23 PM - Name: …`). Detected per line; the
  dominant format is reported.
- **Multi-line messages.** A line with no timestamp prefix is folded into the message
  above it, so a wrapped listing stays whole.
- **System lines.** The encryption notice, "X added Y", subject/description changes — no
  author, flagged `system`, never classified. A short denylist catches the few notices
  that contain a colon ("changed the subject to:").
- **Attachments.** `image omitted` / `<Media omitted>` / `(file attached)` bodies are
  flagged `attachmentOnly` and kept (so counts stay honest), not sent to the model.

`classifiableMessages(parsed)` then keeps only authored, substantive (≥12 char) bodies —
the batch the AI sees, which keeps cost down.

Date→ISO is best-effort (month/day order is locale-dependent and unknowable from the file
alone); the model re-derives event dates from message **text**, so a wrong locale guess
never corrupts an event date.

### 2. Redactor — `lib/whatsapp/redact.ts`

`redactContacts(text)` lifts **phone numbers and emails** out of a body, returning the
cleaned copy plus the captured contacts. Members posted contact details into a *private*
group; those must not ride into public listing copy before the poster claims the listing.
A digit-count guard (7–15 digits) means prices (`$1200`), bedroom counts, and dates are
never mistaken for phones. Idempotent (placeholders carry no digits / `@`). Applied to
**housing** copy; event organizer-contact is left intact (a printed poster is public, and
the event claim handshake transfers control to the host anyway).

### 3. Classifier + extractor — `lib/whatsapp/extract.ts`

`classifyAndExtract(messages, { profileId })`. Mirrors `lib/ai/events-ai.ts` exactly:

- Batches (`28`/call, ≤`700` messages/run) through the shared `completeRaw` chokepoint on
  **Sonnet** (text reasoning over messy chat; quality keeps junk out), forcing one
  structured-output tool (`save_items`).
- Each item is labelled `event` / `housing` / `roommate` / `other`. Events reuse
  `coerceEventExtraction` (identical shape to a poster-scanned event); housing is coerced
  locally and run through the redactor.
- **Governance:** gates on `aiAvailable()` + `featureOverBudget('whatsapp-import')` up
  front and **between batches**, records every call in the usage ledger, and falls back to
  `aiSkipped` (parse only) when AI is off or over budget. Feature cap:
  `whatsapp-import: $5/day` in `lib/ai/budget.ts`.
- **No DB writes.** Returns staged `ClassifiedItem[]` for review.

### 3a. Image association — `lib/whatsapp/associate.ts`

A media-included export (Export chat → **Attach Media** / **Include media**) is a `.zip`
of `_chat.txt` plus the photo files, and each photo line in the text names its file
(`IMG-20240115-WA0001.jpg (file attached)` on Android, `<attached: …jpg>` on iOS). The
parser captures that filename into `WhatsAppMessage.attachmentName`, so the filename→photo
link lives in the text itself and association runs server-side.

`gatherImageNames(messages, item)` (pure, tested) returns the image filenames posted with
a classified item: image attachments within a few messages of the item's own messages,
by the same author. That ties a listing to the room photos posted right after it, and an
event to its flyer, while keeping a neighbour's unrelated photo out. The result lands on
`ClassifiedItem.imageNames`; the dry-run UI matches each name to the actual image file the
operator selected (in the browser, no upload), and the future writer uploads + attaches
them via the existing on-device image pipeline (`app/(main)/events/scan/image-tools.ts`).

For **event flyers**, the image often carries more than the caption. The existing
`scanEventPoster` vision flow already turns a flyer photo into a full event draft, so the
writer step can route flagged flyers through it (budget-gated) for a richer extraction.

### 4. Dry-run surface — `app/(main)/admin/import/`

`/admin/import` (Community → Activity, same gate as `/admin/events`: community host+ OR
community staff). Select the `_chat.txt` plus its
photos (or paste text for a text-only export); the read-only `previewImport` server action
parses + classifies and renders an `ImportPreview`: parse stats, per-category counts, and
a card per event/housing/roommate with its source message refs, a low-confidence flag, and
**thumbnails of the photos posted with it**. Images stay in the browser as object URLs —
nothing is uploaded. A banner states plainly that nothing is saved or posted. The action
**writes nothing** — no event, no listing, no storage object.

## Consent model (the part to get right)

Members posted into a private group with a known audience; republishing publicly is a
different deal than they signed up for. The design respects that:

- **Events** are usually meant to be promoted → the planned writer routes them through the
  existing **posted-event + claim-token** path (`publishEventDraft(profileId, id,
  'posted')`), so the original poster gets a one-tap link to claim and manage the event.
- **Housing** is sensitive → contacts are redacted and held back until a listing is
  claimed; the planned writer imports listings as unclaimed/pending, not auto-published
  with personal phone numbers.

The platform already has a `consent_records` table and an event claim flow; the importer
leans on both rather than inventing a new consent surface.

## Roadmap

| Step | Status |
|---|---|
| Parser + redactor + tests | ✅ this PR |
| AI classify + extract (budget-gated, no writes) | ✅ this PR |
| Read-only dry-run admin surface | ✅ this PR |
| Image association (filenames → listing photos / flyer) + thumbnails | ✅ this PR |
| Writer: approve event → posted draft + claim token | ⏳ next, after dry-run review |
| Writer: approve housing → unclaimed listing, contacts held | ⏳ next |
| Writer: upload + attach associated photos; vision-read flagged flyers | ⏳ next |
| `.zip` upload (skip the unzip step) + de-dup on re-runs | ⏳ next |

## Files

- `lib/whatsapp/types.ts` — shared vocabulary (framework-free).
- `lib/whatsapp/parse-export.ts` (+ `.test.ts`) — the parser (incl. attachment filenames).
- `lib/whatsapp/redact.ts` (+ `.test.ts`) — contact redaction.
- `lib/whatsapp/associate.ts` (+ `.test.ts`) — image-to-listing association.
- `lib/whatsapp/extract.ts` — AI classify + extract.
- `app/(main)/admin/import/{page,import-client,actions}.tsx` — the dry-run surface.
- `lib/ai/budget.ts` — `whatsapp-import` daily cap.
- `lib/admin/nav.ts` — Community → Activity → "Import from chat".
