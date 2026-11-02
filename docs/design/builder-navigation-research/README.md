# Builder Navigation Research Report (design handoff)

Status of any work described here lives in [`docs/BUILD-BACKLOG.json`](../../BUILD-BACKLOG.json), not in this folder. This is reference material.

Source: the Frequency design project, "Builder Audit and Proposal" and "Builder Build Plan" (2026-11-02), exported from Claude Design. Filed so the design side can point at it while designing the new role-driven page builder.

## What is inside

- `docs/EDITOR-NEXT.md`: the spec and rationale for the role-driven builder, including the build/validate/repair/record loop.
- `docs/editor-next.json`: machine copy of the same passes.
- `docs/ledger/rows/BLD-*.json`: proposed ledger rows (BLD-000 rulings, B0 to B4 passes, BZ). Not live: they sit outside the real ledger folder and are not read by `pnpm backlog`.
- `docs/ledger/adr/ADR-NNNN.md`: draft ADR, unnumbered.
- `RUN-WITH-CLAUDE-CODE.md`: how the pack was meant to be applied (copy into `docs/`, take a free ADR number, add rows).

## Not applied

Nothing here is wired into the build. To start the build, follow `RUN-WITH-CLAUDE-CODE.md` in a separate PR (the rows then become real ledger fragments). Five owner rulings (BLD-000) are still pending.
