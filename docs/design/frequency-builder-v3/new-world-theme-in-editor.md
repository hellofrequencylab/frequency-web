# New World, inside the builder

New World is one theme in Frequency's theme system: a general theme for any place that gathers people, built on the Frequency core (Stage and Commons). This folder describes how it renders inside the block builder and what the host can change there. The theme itself, its framework and its dials are specified in `package/`; that package is authoritative.

Two deliberate differences from the standalone demo (`demo/`):
- **No theme editor.** The builder exposes none of the New World dials (corners, spacing, type voice, pairing, motion, hero, header, footer, images, registers) as controls. The theme ships with its own defaults and the host gets Night or Day. The dial framework still applies in the repo; it simply is not surfaced in this builder.
- **The host edits words and structure**, section by section, with readiness checks and Vera. The demo edits nothing.

## 1. Where the theme lives in the builder

| Piece | File | What it does |
|---|---|---|
| Tokens and effects | `theme/newworld.css` | The New World package's full CSS (core tier, alias tier, `--th-*` bridge, effects, textures) with every `:root` rule rescoped to `[data-nw]`, so it lives inside the canvas frame and never touches the builder chrome. Generated from the package; do not hand-edit, regenerate from `package/reference/tokens/`. |
| Content kits | `theme/kits.js` | `package/reference/ui_kits/site/kits.js.txt` verbatim. Seven kits: Your place (the template), Coaches, Studios, Hosts, Venues, Non-profits, Networks. |
| Frequency mark | `theme/frequency-logo.png` | Used as a mask in the footer ("Runs on Frequency") and the tools section. |
| Section markup | `../builder/source/Frequency Builder v3.dc.html`, inside `<sc-for list="{{ visibleSections }}">` | One block per role, inline-styled against the alias tokens (`--ink-*`, `--chrome-*`, `--flare-*`, `--swell-*`, `--halo-*`), with the theme's own classes `v-display`, `v-mono`, `v-grain`, `v-photo`, `v-glass`, `v-topglow`, `v-orb`, `v-pulse`. |
| Accent | `accentFromHue()` in the logic class | The package's derivation: `oklch` steps at chroma .19, Night lightness .72, Day .44, swell at +40°, halo at +300°. Written as `--n-*` and `--d-*` on the frame; each register picks its own. |

## 2. The frame

```html
<div data-nw="night|day" data-th="night|day"
     data-site-corners="soft" data-site-spacing="airy" data-site-header="bar" data-site-footer="full"
     data-type="charge" data-pairing="frequency" data-motion="full" data-image="glow" data-mix="mixed">
```

These are the theme's own defaults (`LOOK_DEFAULT` in `package/reference/ui_kits/site/record.js.txt`). In the repo these attributes come from `siteStyle` and the manifest; here they are fixed.

**Registers are scoped per section.** Each section wrapper carries its own `data-th`. With the Night register: Stage everywhere except members' words (`reviews`) and questions (`faq`), which read on Commons. With the Day register: Commons everywhere except the closing invitation (`cta`), which stays on Stage. Night sections also carry `v-grain`; every section after the first carries `v-topglow`; every section gets one drifting `v-orb` whose hue cycles flare, swell, halo and whose strength is 22% on Night, 16% on Day.

## 3. Type
Pairing `frequency`: Unbounded for display, Hanken Grotesk for body, Instrument Serif italic for the soft phrase; voice `charge` (sentence case plus the serif `em`). Every headline is `title` plus `em`, the `em` being the last words set in the serif. DM Mono labels at 11px, .14em, uppercase (`v-mono`). The Bricolage, Lora and DM Mono faces load from Google Fonts for the `detail` pairing even though the builder does not expose it.

## 4. Accent and contrast
The kit's `palette` names the hue: red 25°, orange 60°, yellow 95°, green 145°, blue 250°, purple 300°. Filled accent buttons use **ink text** on Night (`--accent-text: var(--ink-900)`) and white on Day; accent text uses flare-400 on Night and flare-500 on Day. Both pass 4.5:1 on every hue. No block names a colour.

## 5. Section map (role → New World block)
| role | New World block | rows from | register (Night / Day) |
|---|---|---|---|
| hero | Hero: split (framed photo with the week board), photo (poster), glow, minimal | kit.hero, groups or offers, proof[0] | night / day |
| trust | TrustBar | kit.proof | night / day |
| story | BrandIntro | kit.story, kit.quote, photos[1] | night / day |
| circles | CirclesBlock | kit.groups, photos[3] | night / day |
| events | EventsBlock (week ribbon and agenda) | kit.events plus the next three openings | night / day |
| firstnight | FirstNightBlock | kit.firstVisit | night / day |
| reviews | Reviews (wall) or one big quote | kit.reviews | **day** / day |
| team | TeamBlock | kit.team, photos | night / day |
| services | ServicesGrid | kit.offers | night / day |
| plans | PlansBlock | kit.plans | night / day |
| booking | BookingBlock | next three openings | night / day |
| gallery | GalleryBlock | photos[0..4] | night / day |
| posts | LibraryBlock | kit.posts | night / day |
| shop | ShopBlock | kit.products, photos | night / day |
| steps | Process | STEPS (theme copy) | night / day |
| locations | LocationsBlock | kit address, HOURS, hoods | night / day |
| forms | ContactBlock | static form | night / day |
| letter | LetterBlock | kit copy | night / day |
| faq | FAQSection (stack) or cards | FAQ (theme copy) | **day** / day |
| business | BusinessBlock | the six Frequency tools | night / day |
| cta | CTABand | kit.cta, kit.pain | night / **night** |

Hide, never break: a role whose function the kit has off (no groups, no events, no products, no plans, no posts, no team, or a tool not in `kit.tools`) is not offered in Add and not rendered.

## 6. What the host can change in New World, in the builder
- Every heading, soft phrase and intro per section; the hero's eyebrow, headline, feeling line, body and button; the quote by the door; story lines; first-visit steps; how-it-works steps; member quotes; questions and answers; contact details; the footer's phone, email, hours and city.
- The hero photo (from the Space library, with a description) and its layout: Framed photo, Full-bleed photo, Glow, Minimal. Reviews: Wall or One big quote. FAQ: Stack or Cards.
- Section order, per-device visibility, which sections exist.
- Register: Night or Day.

Not in the builder: accent (it is the Space's), corners, spacing, type voice, pairing, motion, header and footer variants, image treatment, mixed vs single registers. These are theme dials and belong to the theme framework (`package/dials.json`), not to the page editor.

## 7. Sample content and readiness
The `general` kit ("Your place") is the template: hero, story and member quotes are flagged `sample: true` and the hero photo has no description, so the builder's readiness model asks the host to replace them before publishing. The six niche kits are finished demo Spaces and arrive clean. Numbers in proof rows are sample rows; a live Space passes its own.

## 8. Photos
The package names photos `circle-sunrise, garden-picnic, workshop-table, hands-up, group-hug, beach-joy, beach-move, beach-dance, backyard-class, beach-gong, fire-circle, fire-crew` with no files shipped. The builder maps them onto the seven Frequency gathering photos (`PHOTO` in the logic class) and carries a written description per name (`ALT`). Drop the real set into `assets/photos/` under those names and remove the map.

## 9. Repo landing
Per `package/frequency/README.md` and `package/IMPLEMENTATION-PLAN.md`: contract to `lib/sites/editor/theme-contract.json` → `themes.New World`; manifest `services.manifest.json` at `schema: 2`; kits beside `*-variants.ts` with `tools[]`; Spotlight layouts as `services-kit:*`; blocks as TSX under `components/page-editor/blocks/` reading tokens only.
