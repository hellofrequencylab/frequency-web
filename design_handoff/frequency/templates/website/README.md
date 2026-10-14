# Frequency marketing site · build notes
Static HTML front end on the Frequency design system (Stage theme). Every page is plain HTML + CSS + vanilla JS. There's no build step, so it can be ported straight into any framework.

## Structure
```
site/
  Home People Spaces Features Pricing Stories Vision Join Help .html
  styles.css, tokens/            core design system (locked; change in the DS, never here)
  assets/                        logo, icons sprite + icons.js, photos, broll, facilities
  web/
    site.css                     layout: header v4, footer, sections, event map, location pill
    side.css / side.js           People ⇄ Spaces side state, pop-in reveals, parallax, dock
    megamenu.js                  header, mega menus, search index, account cluster
    eventmap.js                  Leaflet + OSM maps on [data-fqmap]; loads Leaflet on demand
    fx.css / fx.js               mood (palette, orbs) + texture (grain, signal lines, card light, logo sheen)
```

## Load order (every page)
- **`<head>`:** font preconnect and the stylesheet link, then `styles.css`, `web/site.css`, `web/fx.css` and `web/side.css` (on pages that use it).
- **End of `<body>`:** `web/side.js`, `assets/icons/icons.js`, `web/eventmap.js` (map pages only), `web/megamenu.js`, then `web/fx.js` last.

`fx.js` must run after `megamenu.js` and `side.js`. It reads the built header and the side state.

## Page state attributes
- `body[data-theme="stage"]`: always set on marketing pages.
- `body[data-side="p|e"]`: People or Spaces. Toggled by any `[data-set]` button and persisted in `localStorage['fq-home-side']`. `body[data-lock]` pins a page to one side.
- `[data-energy="still|flow|charge"]` and `[data-night="uv|thermal"]`: set per section, and they drive pulse speed and signal-line amplitude.
- `fx.js` sets `body[data-mood]`, `body[data-energy-page]` and `--m1/--m2/--m3` from the page table below.

| Page | Energy | Hues | Notes |
|---|---|---|---|
| Home | charge | magenta, aqua, sun | hero sphere meanders down on scroll; orbs through the photo scroll |
| People | flow | aqua, violet, cyan | |
| Spaces | flow | sun, magenta, violet | |
| Features | flow | per half | People half aqua, Spaces half sun |
| Pricing | still | sun, violet, aqua | quiet: fewer, fainter orbs |
| Stories | flow | magenta, sun, violet | |
| Vision | still | violet, cyan, lime | |
| Join | flow | side colour, magenta, violet | sphere behind the form |
| Help | still | violet, aqua | orbs in the hero only |

## Copy canon
- **Platform line:** "Gather like it matters."
- **Tagline:** "Build circles, not walls."
- **Calendar surface:** called "What's happening".
- **Side toggle:** "Browse Community / Host Community".

## Performance budget and what's already done
- **Images:** recompressed to JPEG q78, 1800px max. The facility render went from a 7 MB PNG to a 400 KB JPEG. Every image below the first section has `loading="lazy" decoding="async"`. In production, serve AVIF/WebP via `<picture>` and add `width`/`height`.
- **Fonts:** preconnect plus a direct stylesheet link in `<head>`, so the core `@import` chain no longer blocks. `display=swap`.
- **Leaflet:** no longer render-blocking. `eventmap.js` injects it (with SRI) when a map comes within 400px of the viewport.
- **Scroll:** one rAF-batched loop in `fx.js` (reads first, then writes) and an rAF-throttled tick in `side.js`. The hero sphere moves with `translate`, never `left`/`top`.
- **Animation:** orb fields pause when offscreen (`[data-off]`, via IntersectionObserver). Signal lines redraw at about 30fps, only while visible and only while the tab is visible. Film grain is hidden under 860px.
- **Grain:** one generated bitmap tile (`--fx-noise`) replaces the per-element SVG `feTurbulence` filter.
- **Reduced motion:** `prefers-reduced-motion` stops every loop (aura, orbs, grain, signal lines, logo sheen, ticker).

## When porting to a framework
- **Static pieces:** the header and footer are identical on every page. Make each one component. `megamenu.js` owns the header content, menus and search index (`IDX`, `FJ`).
- **Weave chart:** the Home weave chart data is the `W` array in Home's inline script, and the feature journeys are `FJ` in `megamenu.js`. Keep them in sync: the weave's six stages map to Features' four People stages and four Spaces stages.
- **Map data:** event and Space data in `eventmap.js` (`EV`) is sample data. Replace it with the API.
- **Forms:** the Join and Help forms are front-end only. Wire `form.jx-f` and `#hpc` to the backend.
- **Dynamic content:** `fx.js` decorates dynamic content (menus, map popups) through a debounced MutationObserver. In a framework, call the same functions after mount instead.
