import { SERVICES_CSS } from '@/components/sites/services-css'

// THE NEW WORLD BLOCK SHEET (LIVE-2055, first pass). New World's kits still compose the Services block family
// (components/page-editor/blocks/services.tsx, classes `.sv-*`), and those blocks were drawn from the same design system, so every
// token the Services block sheet reads exists under the New World prefix with the same meaning. This derives New World's sheet from
// that one source instead of forking 25 KB of CSS: the scope moves to [data-house-theme="new-world"], `--sv-*` tokens become
// `--nw-*` (the shadow ramp sm, md and lg is `--nw-depth-*`, #4529; the glow keeps `--nw-shadow-glow`), and the two values a block sets inline on itself (--sv-min, --sv-ratio)
// keep their names. The blocks keep their class names until they are re-cut as New World blocks. Scoped like the skin, so it can
// only dress the stand-alone site render.

export const NEW_WORLD_BLOCKS_CSS = SERVICES_CSS.replaceAll('[data-house-theme="services"]', '[data-house-theme="new-world"]')
  .replace(/--sv-shadow-(sm|md|lg)\b/g, '--nw-depth-$1')
  .replace(/--sv-(?!min\b|ratio\b)/g, '--nw-')
  // The design's frame is content-box: 1320 of content plus the gutter either side (--nw-frame), so every row lines up with the chrome.
  .replaceAll('max-width:var(--nw-container-max)', 'max-width:var(--nw-frame)')
