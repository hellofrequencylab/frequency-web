# Header quick-nav (and the retired teaser gate)

One member-facing addition to the authenticated app shell, and a note on a gate that was retired.

## 1. Header quick-nav (Feed · Circles)

`components/layout/app-shell.tsx`: two text links in the top-right cluster, just
left of the search pill, **desktop only**. Styled in the brand amber ("light
burnt orange", `text-primary`) with an active pill state.

- **Feed** → `/feed` (your live activity stream).
- **Circles** → `/circles` (the web of groups you can find and join, the app's
  "network"). Repoint either by editing the small array in the header; it's a
  one-liner.

## 2. Teaser gate (retired 2026-09-29)

The teaser gate is gone. It was a client wrapper (`TeaserGate`) that let a
below-tier member peek at gated content for 30 seconds, then blurred it behind an
upgrade prompt. It shipped switched off (`TEASER_GATE_ENABLED = false`) and was
mounted in one place, the Circle feed, where it rendered its children untouched.

The owner ruled "Retire it" (LIVE-680, ADR-1659). The wrapper, its flag module and
its test were deleted, and the Circle feed renders exactly as it did with the flag
off. Premium surfaces use `CrewGate`, `UpsellTease` or the meter upsell
(`docs/VALUE-LADDER.md`). A future paywall starts from those, not from this
document.
