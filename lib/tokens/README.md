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

**Carry the four axes too.** The live theme is a four-axis `data-*` model — mode ×
skin × occasion × generation — composed through the CSS custom-property cascade
(`docs/THEME.md`, ADR-257). The axes are token-set *deltas* over the DAWN baseline,
so the W3C-token extraction must export not just the base set but each axis override
(the typed registries in `lib/theme/` are the index to enumerate). Designing the
export this way keeps a Space's brand and a member's chosen generation surviving the
web → native generation. See `docs/THEME.md` §10.
