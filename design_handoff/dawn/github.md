repo: hellofrequencylab/frequency-web
branch: main
path: design_handoff

## Last sync
date: 2026-08-03T21:30:00Z

### Updated in this project
- Marketing vertical rhythm rebuilt as a four-role system with a double-count correction; every marketing page retuned.
- Rail open/close controls unified as one quiet affordance at the foot of each rail.
- Pricing restructured on ADR-590 canon (three free doors, then Business/Collective/Non Profit on ink); the Lab reframed as a 2028 vision page with no rates.
- `Glyph` added as a DS primitive, fixing six components that drew raw `data-lucide` nodes; creation wizard and the message-board rebuild added.

## Screen map
| Screen / artifact | Built from |
|---|---|
| `tokens/colors.css`, `tokens/skins.css` | `design_handoff/HANDOFF-TO-DAWN-2026-08-03.md` §2, §3 (mirrors `app/globals.css`) |
| `tokens/spacing.css`, `tokens/typography.css`, `tokens/fonts.css`, `tokens/effects.css` | same handoff §4, §5, §6, §7 |
| `guidelines/brand-voice.card.html` | `BRIEF-02-AUDIENCE-AND-VOICE.md` |
| `guidelines/brand-page-spine.card.html`, `brand-templates.card.html`, `brand-loom.card.html` | `BRIEF-05-DESIGN-DIRECTION.md` |
| `guidelines/quest-rank-badges.card.html`, `colors-rank.card.html`, `quest-icons.card.html` | `BRIEF-01-WHAT-FREQUENCY-IS.md` §3, `BRIEF-02` §3 |
| `ui_kits/app/*` | the live `frequencylocal.com/feed` capture plus `BRIEF-05` in-app principles |
| `ui_kits/marketing/*` | `BRIEF-04-MARKETING-AND-FUNNELS.md` §2, §4, §6 |
| `readme.md` | briefs 01 to 05 |
| `handoff/CHANGES.md` | the reply set for the next repo PR |
