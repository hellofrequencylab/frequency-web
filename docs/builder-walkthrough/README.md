# Builder owner walk-through (BLD-902)

Status and the roster live in the backlog row (`pnpm ledger:view BLD-902`), not here. This file is how a session runs.

## What a session is

One real Space owner builds or edits a page in the builder, on production, on their own Space, while one observer watches and writes notes. Five owners are needed. The owner is never coached; the observer steps in only to unblock, and that is logged as `helped`.

## Before

- Ask the owner for about 45 minutes and their own Space. Nothing is recorded by the product; the observer writes the log by hand, so no owner's words are captured by the builder itself.
- Tell them the point: we are testing the builder, not them.
- Start from a blank page when they have no site yet, otherwise from the page they already want to change.

## What the observer writes down

One entry per owner, shaped like `session.example.json`:

- `published`: the owner got a page live.
- `helped`: the team stepped in to unblock (anything short of watching).
- `used`: every control touched on the way, as `{ "id", "layer" }` (layer 1 or 2 as it sits today).
- `searched`: control ids the owner looked for in ⌘K or the Add sheet's search instead of finding them on the page.
- `notes`: every hesitation and failed find, with a timestamp, in plain words.

## After

Add the entry to `docs/builder-walkthrough/sessions.json` (copy the shape from `session.example.json`; create the file with the first session). Run `pnpm walkthrough:builder`. It prints who published unaided, which controls more than two owners searched for, and which Layer 2 controls three of five owners used (these move into Layer 1).

## Done

Five distinct owners are logged and the command passes. Then close the row with `pnpm ledger:close BLD-902`.
