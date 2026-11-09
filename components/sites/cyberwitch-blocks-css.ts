import { SERVICES_CSS } from '@/components/sites/services-css'

// THE CYBERWITCH BLOCK SHEET. CyberWitch's kits compose the Services block family (components/page-editor/blocks/services.tsx,
// classes `.sv-*`) until CyberWitch cuts its own, exactly as New World does (components/sites/new-world-blocks-css.ts). This derives the
// sheet from that one source: the scope moves to [data-house-theme="cyberwitch"], `--sv-*` tokens become `--cw-*`, and the two values a
// block sets inline on itself (--sv-min, --sv-ratio) keep their names. The names the Services sheet reads that the CyberWitch design
// does not declare (swell, halo, salt, depth, glow-sunset ...) are answered in CYBERWITCH_BLOCK_ALIASES from the design's own colours.
// Scoped like the skin, so it can only dress the stand-alone site render (ADR-1906).

const C = '[data-house-theme="cyberwitch"]'

/** The `--cw-*` names the borrowed block sheet reads, answered in iron, bone and the one neon accent. Every value is a design token. */
export const CYBERWITCH_BLOCK_ALIASES = `
${C}{
--cw-border-hairline:1px;
--cw-border-light:var(--cw-border-subtle);
--cw-salt-300:var(--cw-ink-700);
--cw-salt-700:var(--cw-chrome-200);
--cw-text-on-light:var(--cw-chrome-50);
--cw-text-on-light-muted:var(--cw-chrome-200);
--cw-surface-light:var(--cw-ink-850);
--cw-surface-light-sunken:var(--cw-ink-950);
--cw-swell-300:var(--cw-clash-300);
--cw-swell-500:var(--cw-clash-500);
--cw-halo-300:var(--cw-flare-300);
--cw-halo-500:var(--cw-flare-600);
--cw-text-accent:var(--cw-flare-400);
--cw-action-primary:var(--cw-flare-500);
--cw-action-primary-text:var(--cw-on-accent);
--cw-focus-ring:var(--cw-flare-300);
--cw-success-500:var(--cw-success);
--cw-warning-500:var(--cw-warning);
--cw-danger-500:var(--cw-danger);
--cw-font-display:var(--cw-font-gothic);
--cw-font-accent:var(--cw-font-scrawl);
--cw-font-mono:var(--cw-font-caps);
--cw-fs-body-l:var(--cw-fs-lede);
--cw-fw-regular:400;
--cw-fw-medium:500;
--cw-fw-bold:600;
--cw-fw-heavy:700;
--cw-lh-snug:1.15;
--cw-ls-button:.14em;
--cw-ls-mono:var(--cw-ls-label);
--cw-stretch-display:100%;
--cw-radius-sm:var(--cw-corner-sm);
--cw-radius-md:var(--cw-corner);
--cw-radius-lg:var(--cw-corner-lg);
--cw-radius-xl:var(--cw-corner-lg);
--cw-sheen:linear-gradient(180deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent),transparent 40%);
/* token-ok: hard 2px plate shadow, the skin literal */
--cw-depth-sm:0 2px 0 rgba(0,0,0,.55);
--cw-depth-md:var(--cw-shadow-plate);
--cw-depth-lg:var(--cw-shadow-poster);
--cw-shadow-glow:var(--cw-glow-md);
--cw-glow-sunset:var(--cw-haze-top);
--cw-glow-sky:var(--cw-haze-bottom);
--cw-spread-tr:linear-gradient(to bottom left,color-mix(in oklab,var(--cw-flare-500) 22%,var(--cw-ink-900)) 0%,transparent 70%);
--cw-spread-tl:linear-gradient(to bottom right,color-mix(in oklab,var(--cw-flare-500) 16%,var(--cw-ink-900)) 0%,transparent 70%);
--cw-spread-br:linear-gradient(to top left,color-mix(in oklab,var(--cw-clash-500) 14%,var(--cw-ink-900)) 0%,transparent 70%);
--cw-overlay-bottom:linear-gradient(180deg,transparent 35%,color-mix(in oklab,var(--cw-ink-950) 95%,transparent) 100%);
--cw-overlay-scrim:linear-gradient(90deg,color-mix(in oklab,var(--cw-ink-950) 90%,transparent) 0%,color-mix(in oklab,var(--cw-ink-950) 60%,transparent) 45%,color-mix(in oklab,var(--cw-ink-950) 20%,transparent) 100%);
--cw-grad-lit:linear-gradient(100deg,var(--cw-flare-300) 0%,var(--cw-chrome-50) 30%,var(--cw-clash-300) 55%,var(--cw-flare-400) 78%,var(--cw-flare-300) 100%);
}`

export const CYBERWITCH_BLOCKS_CSS = `${CYBERWITCH_BLOCK_ALIASES}
${SERVICES_CSS.replaceAll('[data-house-theme="services"]', C)
  .replace(/--sv-shadow-(sm|md|lg)\b/g, '--cw-depth-$1')
  .replace(/--sv-(?!min\b|ratio\b)/g, '--cw-')}`
