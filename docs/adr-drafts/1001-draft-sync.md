# ADR-1001: A draft belongs to the author, not to the browser they started it in

**Status:** drafted, migration UNAPPLIED
**Follows:** ADR-991 (Spark autosave, local only), ADR-597/986 (the Studio kernel + manifests),
ADR-450 §2 (the one seam between creating and editing), ADR-964 (revoke the default grants),
ADR-069 Phase 5b (retention enforcement), ADR-066 (`ai_member_context`, the erasure posture)

## Context

ADR-991 gave every Spark autosave, in `localStorage`, with no wizard edited. It works. It also
carried one piece of reasoning that was wrong, and the wrongness is the whole reason this ADR
exists:

> "a server draft needs a row, and a row is the entity existing before the author committed a
> reviewed title"

Deferred creation forbids an untitled row in the **entity's own table**. No half-baked Journey in
the library, in the author's list, or in search. It says nothing about a **staging table**, and
this codebase already stages wizard state server-side three times before any entity exists:
`business_intake`, `event_intake` (20270222000000), and `studio_steer` (20270223000000). The rule
was never in the way.

What the local-only version cost: an author who starts a Journey on a laptop at lunch and opens
the same Spark on a phone that evening is offered nothing. The draft is not theirs. It belongs to a
browser.

## Decision

**Keep `localStorage`. Add the server as a second copy, not a replacement.** The two do different
jobs and both are load-bearing:

| | Local (`components/studio/spark/draft/draft-store.ts`) | Server (`lib/studio/draft-store.ts`) |
| --- | --- | --- |
| Job | make typing feel instant | make the draft **the author's** |
| Written | on the existing 800ms debounce | about every 2s, plus a flush on hide/unmount |
| On failure | there is no failure to speak of | falls back to local, silently |
| Blocking | never | never |

### 1. The table: `studio_draft`, keyed `(profile_id, scope)`

Migration `supabase/migrations/20270224000000_studio_draft.sql`. **UNAPPLIED.** Purely additive:
one table, one index, its RLS. No `ALTER` or `DROP` on anything existing.

Two extra columns, `route` and `label`, exist only so `/drafts` can offer a way back in: `scope` is
a slug and cannot be reversed into a path. Both come from the shell (the pathname and the eyebrow),
are stored verbatim, and are validated on the way out (a `route` that is not a plain in-app path is
dropped rather than turned into an href).

`profile_id` is the point of the feature (the draft follows the author) **and** the entire access
control (a read filtered to the session's own id can return nothing else). `scope` is the Spark's
route-derived key, entity-blind by construction, because there is no entity id yet and there never
will be one before the commit. A newly composed Spark inherits cross-device drafts with no
migration and no type change.

The column is `answers`, not `values`: `VALUES` is reserved in Postgres.

Posture mirrors `studio_steer` exactly: RLS **enabled**, **zero** policies, default grants revoked
from `anon` and `authenticated`, registered in `scripts/rls-deny-all.txt`, verdict `internal` in
`scripts/table-grants.txt`. The only access path is one audited server file.

### 2. Newest wins, but never silently

`reconcileDrafts` (`components/studio/spark/draft/draft-sync.ts`) is pure and is the **only** place
the decision is made. Five rules, in order:

1. An expired copy on either side is not a copy.
2. An empty copy is not a copy.
3. **Identical copies are not a conflict.** This is the ordinary case (the device wrote, the sync
   pushed); asking here would train people to click through the card that matters.
4. The server copy only wins when it is newer by more than `CLOCK_SKEW_MS` (60s). A device clock
   and the database clock are different clocks; anything closer is a tie, and a tie goes to the
   device the author is sitting at.
5. **Newer and different means ASK.** Two timestamps on a card, two buttons naming what each
   keeps, no merge. Half of one draft mixed into half of another is a document nobody wrote.

A silent clobber is how someone loses an hour of writing. That is the worst outcome this feature
can produce, so it is the one thing tested exhaustively.

### 3. The clobber gate

Pushes are gated on `SyncGate.ready`, which only becomes true when the server **answered** the
opening read. A Spark that could not reach the server therefore never pushes, so it can never
overwrite a newer copy it failed to read. Local-only is the correct degraded state; the gate is
what makes it safe rather than merely quiet.

### 4. One loop, not two

The debounce is still the Studio's autosave engine (`components/studio/kit/use-studio-draft.ts`).
The server push rides inside the same `persist` call, rate limited to `SERVER_SYNC_MS`, with a
30s backoff on failure and a flush on `visibilitychange: hidden`, `pagehide`, and unmount. No
second timer watches the keyboard.

### 5. Seven days, both sides

The same window as the local copy, enforced twice: the nightly retention cron
(`lib/consent/retention.ts` calls `purgeExpiredStudioDrafts`) deletes rows past it, and **every
read filters on it**, so a missed sweep can never resurrect a month-old draft.

### 6. Erasure

Unfinished text now lives in the database, so it takes the `ai_member_context` posture
(docs/AI-VERA.md §5): member-readable, one-click erasable.

- **`/drafts` is the single home**, not a second settings screen. The page already lists pending
  `studio_create` proposals; unfinished wizard drafts join the same list, told apart by a badge
  (`app/(main)/drafts/unfinished-row.tsx`). "Vera drew this up" vs "you typed this" is our
  implementation detail; to a member both are "things I started and have not finished", and two
  surfaces both called Drafts would be worse than either alone. Each row bins in one tap
  (`binUnfinishedDraftAction`), and the answers themselves are counted, never rendered back.
- The rows are a section of the member data export (`lib/privacy/export.ts`).
- Account deletion needs no code: `profile_id` cascades from `profiles`, which cascades from the
  auth user `lib/account.ts` deletes.

## What did not change

- **The refusal list.** Passwords, payment `autocomplete`, file inputs, hidden inputs, and
  `data-spark-draft="off"` are refused at collection, and a **second** key-level gate
  (`refuseNamedSecrets`) runs on the way into the database. A leaked secret is worse server-side
  than it is in one browser.
- **The size caps.** 20k per value, 100k per draft, applied again server-side.
- **No completion meter.** Save-and-resume reduces abandonment; a progress ring is decoration.
- **Zero wizard files edited.** Composing `SparkShell` is still the whole wiring.
- **Deferred creation.** No entity row exists before the commit each wizard already gates.

## Consequences

- One more `internal` table (275 live public tables, 81 internal).
- The migration is unapplied, so until it is applied every server call fails soft and the Spark
  behaves exactly as it did under ADR-991. That is the intended shipping state.
- `lib/database.types.ts` does not know the table yet, so the store uses the untyped admin handle
  (ADR-246), as `studio_steer` did.
- A cross-device conflict card is a new thing an author can see. It is rare by construction (rule 3
  removes the common case) and it is the only alternative to losing work.
