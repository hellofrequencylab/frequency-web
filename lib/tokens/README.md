# Design tokens (structural slot)

**Today (web):** the source of truth for color/spacing is `app/globals.css` (the
DAWN semantic CSS variables + the `@theme inline` Tailwind mapping). See
`docs/ARCHITECTURE.md` → "Styling & design tokens." Do **not** introduce a second
source that can drift.

**Why this folder exists:** when the mobile app (Expo/RN) arrives, web and native
must share *one* token source so branding/theming survives a framework change
(SCALE-ARCHITECTURE §3, CAPABILITIES-AND-MOBILE §4c). The plan is to extract the
DAWN values into a vendor-neutral **W3C Design Tokens** JSON here and *generate*
both the web CSS variables and native style constants from it.

**Not yet built** — extraction is a Phase 5 (mobile) task. This README marks the
structural slot so the move is a known, planned step rather than a retrofit.
