# Findings files — the convention

> **One file per moderated round**, named `YYYY-MM-DD.md` for the day the **last** session
> in that round ran. Nothing else lives in this folder except this README. The protocol
> that produces these files is [../PROTOCOL.md](../PROTOCOL.md).

## Why these are in git

They are technical inputs to design: the DAWN outbound handoff reads the newest one, and
the ratchets and screen passes act on it. [DOCS-PROTOCOL.md](../../DOCS-PROTOCOL.md)
router step 1. They are **not** operator instructions, so they never go to Notion. If a
round turns up something an operator must do differently, that goes to the Notion training
page and the findings file links to it.

## Naming

| Rule | |
|---|---|
| Filename | `YYYY-MM-DD.md`, ISO, zero-padded. `2026-11-14.md`. |
| Date | The day the **last** session of the round ran, not the day it was written. |
| One per round | Never one per participant, never one per finding. A round is a file. |
| Nothing else | No drafts, no `notes-*.md`, no images. The freshness gate scans `\d{4}-\d{2}-\d{2}\.md` and ignores this README; anything else in here is noise it has to be taught to skip. |

## Required shape

Every findings file has these six sections, in this order. The handoff step and the
freshness gate both depend on the headings being stable.

```md
# Findings — round of YYYY-MM-DD

> One paragraph: who we ran, on what, and the single biggest thing we learned.

## The round
Participants (P1-Pn, role + device) · preview URL · branch · dates · moderator.

## What users tripped on
The table the DAWN handoff carries out. Worst-first. One row per distinct trip.

| Severity | Journey | Where | What happened | Who |
|---|---|---|---|---|
| 🔴 | J2 | Feed → Circles | 4 of 5 hunted the rail before using search | P1 P2 P4 P5 |

## Journey outcomes
| Journey | Completed | Timed out | Notes |

## Quotes
Verbatim, attributed to P{n} only, and only from participants who consented to quoting.

## What we are changing
One line per trip: the fix, and where it lands (a DAWN question, a screen pass, a ratchet,
or "accepted, no change" with the reason).

## Open questions for the design round
The ones a code change cannot answer. These become the outbound handoff's asks.
```

## Rules

- **Severity uses the house legend**: 🔴 blocker (the journey cannot complete) · ⚠️ friction
  (completes, but slowly or wrongly) · ⏳ watch (one participant, unconfirmed). See
  [PRESENTATION.md](../../PRESENTATION.md).
- **A trip is a place plus a behavior, never a solution.** "P3 hunted the rail for Events
  for 20 seconds" is a finding. "The rail needs an Events link" is a proposal, and it goes
  in *What we are changing*.
- **Anonymized always.** `P1`-`P5`, no names, no handles, no screenshots carrying either.
- **Never edit a past round.** A finding that turns out to be wrong gets corrected in the
  NEXT round's file with a line saying so. These files are a record of what we saw on a
  date, not a live document.
- **No em dashes** in anything quoted or member-facing ([CONTENT-VOICE.md](../../CONTENT-VOICE.md)).

## What happens to a file once it lands

1. The newest file's **What users tripped on** table is copied into the next outbound DAWN
   handoff ([`design_handoff/SYNC.md`](../../../design_handoff/SYNC.md), "Findings + vitals").
2. DAWN's reply in `CHANGES.md` is expected to answer each row.
3. Anything the design round cannot answer becomes a screen-pass or ratchet item.
