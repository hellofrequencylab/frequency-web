# Free creator flow (FH-012)

Status is the ledger (`pnpm ledger:view FH-012`), never this file. This page is the design FH-013 (editor and preview) builds. Source: Frequency Hunts Build Plan, Tier 1; decisions D1 (`DECISIONS-D1.md`) and D2 (`DECISIONS-D2.md`).

**Decided 2026-11-10 under the owner's delegation to best practice.** Copy below follows `docs/marketing/voice-and-language-guide.md` and `docs/CONTENT-VOICE.md`: warm, plain, pain point first, no em dashes, no hard claims. Names follow `docs/NAMING.md`.

## The job

A resident describes a clue trail, adds three stops, previews it as a player would, and publishes it, without choosing a Space and without seeing a graph. Done when a resident can describe and preview a three-stop trail with no Space selected.

## Who owns it

The owner is the resident (`hunts.owner_profile_id`). A Space is never required. A Space can be attached later, and only a Space the resident already runs. Moving ownership to a Space uses the D2 transfer (start, accept, audit).

## Five steps

| Step | What the resident does | What it writes |
|---|---|---|
| 1. Name it | Title, one-line hook, area (a place name, no map pin needed), who it is for | Draft Hunt, owner profile, visibility `private` |
| 2. Add stops | Three to ten stops. Each stop: a place name, a clue, an optional hint, how it is proven (scan a code placed there) | One mission per stop, in order |
| 3. Choose the shape | Preset: **Trail** (stops in order, finish at the last). Later presets (Passport, Rally) are other rows | Graph edges from the preset; the resident never edits edges |
| 4. Preview | Play the draft as a player, from the first clue | Nothing real (see Preview) |
| 5. Publish | Run the checklist, choose `unlisted` or `public`, publish | Immutable published version; `public` waits for moderation |

The clue writer is an assistant that coaches with questions ("What would someone see right before they find it?"). It never writes the clue for the resident, the same rule as Vera.

## Preview

Preview runs the same evaluator as play (`lib/hunts/graph`) over the draft, and credits are held in the browser session only. It writes no claim, no progress, no outbox row and no audit row, and it never counts toward any total. A preview of a newer draft revision replaces the older one; an older tab cannot overwrite a newer revision (revision check on every save).

## Publish checklist

Each item is a blocker with a plain reason and a fix link. Publishing stays off until every one is clear.

1. The graph validates (`validateGraph` returns no blockers: no cycle, finish reachable, a free path exists, within 30 missions).
2. Every stop has a place name and a clue.
3. Every stop has at least one live placement the resident has marked as printed or placed.
4. The title and clues pass the moderation screen.
5. The resident has run the route test once on the current revision (every stop previewed in order).
6. The resident has confirmed they have permission to place a code at each place.

## Copy states

Short and kind. Empty states use `docs/PRESENTATION.md` (lead with the next step).

| State | Copy |
|---|---|
| Empty list | "No trails yet. Start one with three stops." |
| Empty stops | "Add your first stop. Where does the trail begin?" |
| Missing clue | "This stop needs a clue. What would a stranger notice first?" |
| Route test needed | "Walk it once in preview before you publish." |
| Cycle blocker | "Two stops send people in a circle. Reorder them so the trail ends." |
| Placement missing | "Print or place a code at this stop so people can prove they were here." |
| Awaiting review | "Thanks. A person will look at this before it goes on the public list. Your link already works." |
| Published | "Your trail is live. Share the link." |

## Out of scope here

The editor screens and routes are FH-013. Placement and the scan landing are FH-014. The player is FH-015 and FH-016. Moderation tools are FH-018. Everything stays behind `HUNTS_AUTHORING_ENABLED` (`lib/hunts/flags.ts`).
