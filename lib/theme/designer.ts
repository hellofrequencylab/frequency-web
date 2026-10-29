// THE DESIGNER THEME, for frequency-web. PURE.
// Built from the Alli Rae Build + Design system ("limewash + daylight", matured): a light, material palette
// sampled from the logo and the project photography. Modelled on lib/theme/midnight.ts and temple.ts: the
// palette, the accent rule, the --dz-* vocabulary and the scoped token block a website wears under
// [data-house-theme="designer"].
//
// The standard:
//   · Plaster page, linen and sand-soft alternate grounds, charcoal ink, one ochre accent. Terracotta is the
//     link and the one warm call per page. Sage is the cool note.
//   · Cormorant for display (italic is the emotional voice), Jost for body and tracked caps labels.
//   · Soft corners (8 / 18 / 28 / 40), warm brown shadows (never neutral grey), the ARCH on one photo a section.
//   · Slow, soft motion. Reduced motion stops it.
//
// Contrast (measured): charcoal on plaster 10.9:1 · stone on plaster 5.6:1 · ochre-deep on plaster 4.5:1 ·
// terracotta-deep on plaster 6.1:1 · plaster on charcoal 10.9:1.

import { HEX_ACCENT, contrastRatio, type AccentVars } from '@/lib/spaces/accent'
import { DESIGNER_KIT_TOKENS_CSS } from './designer-kit-tokens'

/** The palette, as the design system's tokens/colors.css names it. */
const DESIGNER_PALETTE = {
  charcoal: '#343736', charcoal80: '#4A4E4C', ink: '#262827', stone: '#5F625F', walnut: '#5A4533', travertine: '#E4D8C4',
  parchment: '#FBF8F2', sage: '#9DB2B4', sageSoft: '#D6E0E0', sageDeep: '#4E6E71', sand: '#F2DCB8', sandSoft: '#F8ECD8',
  ochre: '#D3A03F', ochreDeep: '#9A6C1C', terracotta: '#A65A3A', terracottaDeep: '#874429',
  plaster: '#F7F3EC', linen: '#EFE8DC', paper: '#FFFFFF', line: '#DAD0BF', lineSoft: '#E8E0D2', error: '#A8402F', success: '#5E7353',
  // The design system's strong rule, disabled text, and the deep and soft shades of the status colours.
  lineStrong: '#C9BCA6', disabled: '#8E8A84', sageInk: '#2F4648', infoSoft: '#E6EDED', errorSoft: '#F6E4DE', successDeep: '#3A4934', successSoft: '#EAEEE4',
} as const

const P = DESIGNER_PALETTE

/** The ochre, its text shade on light, and the label that reads on it. */
export const DESIGNER_ACCENT = { accent: P.ochre, text: P.ochreDeep, on: P.charcoal, bg: P.sandSoft } as const

/** THE ONE FLAT TOKEN SET every other Designer surface reads (Spotlight preset, email, event pages). */
export const DESIGNER_SURFACE = {
  canvas: P.plaster, raised: P.parchment, elevated: P.paper, border: P.line, text: P.charcoal, muted: P.stone, subtle: P.stone,
  solid: P.charcoal, onSolid: P.plaster, dark: false, accent: DESIGNER_ACCENT,
  semantic: { success: P.success, info: P.sageDeep, danger: P.error },
} as const

/** The Space's --color-primary* family on a Designer website. No accent, or the ochre itself: the measured
 *  ochre. Any other hex: that hex, a darker text shade, and a label that reads on it. */
export function designerAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === DESIGNER_ACCENT.accent) {
    return {
      '--color-primary': DESIGNER_ACCENT.accent,
      '--color-primary-hover': DESIGNER_ACCENT.text,
      '--color-primary-strong': DESIGNER_ACCENT.text,
      '--color-primary-bg': DESIGNER_ACCENT.bg,
      '--color-text-on-primary': DESIGNER_ACCENT.on,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': `color-mix(in srgb, ${accent} 80%, ${P.charcoal})`,
    '--color-primary-strong': `color-mix(in srgb, ${accent} 70%, ${P.charcoal})`,
    '--color-primary-bg': `color-mix(in srgb, ${accent} 16%, ${P.plaster})`,
    '--color-text-on-primary': contrastRatio(P.charcoal, accent) >= 4.5 ? P.charcoal : P.plaster,
  }
}

const DESIGNER_VARS = `
--dz-charcoal:${P.charcoal};--dz-charcoal-80:${P.charcoal80};--dz-ink:${P.ink};--dz-stone:${P.stone};--dz-walnut:${P.walnut};--dz-travertine:${P.travertine};
--dz-parchment:${P.parchment};--dz-sage:${P.sage};--dz-sage-soft:${P.sageSoft};--dz-sage-deep:${P.sageDeep};--dz-sand:${P.sand};--dz-sand-soft:${P.sandSoft};
--dz-ochre:${P.ochre};--dz-ochre-deep:${P.ochreDeep};--dz-terracotta:${P.terracotta};--dz-terracotta-deep:${P.terracottaDeep};
--dz-plaster:${P.plaster};--dz-linen:${P.linen};--dz-paper:${P.paper};--dz-line:${P.line};--dz-line-soft:${P.lineSoft};--dz-line-strong:${P.lineStrong};--dz-disabled:${P.disabled};--dz-sage-ink:${P.sageInk};--dz-info-soft:${P.infoSoft};--dz-error-soft:${P.errorSoft};--dz-success-deep:${P.successDeep};--dz-success-soft:${P.successSoft};--dz-error:${P.error};--dz-success:${P.success};
--dz-on-dark:var(--dz-plaster);--dz-on-dark-muted:rgba(247,243,236,.82);--dz-rule-dark:rgba(247,243,236,.16);
--dz-shadow-1:0 0 0 1px rgba(90,69,51,.05),0 1px 1px rgba(60,48,36,.04),0 2px 4px rgba(60,48,36,.05),0 8px 16px -6px rgba(60,48,36,.08);
--dz-shadow-2:0 0 0 1px rgba(90,69,51,.05),0 1px 2px rgba(60,48,36,.05),0 6px 12px -2px rgba(60,48,36,.07),0 24px 40px -16px rgba(60,48,36,.18);
--dz-shadow-3:0 0 0 1px rgba(90,69,51,.04),0 2px 4px rgba(60,48,36,.06),0 16px 32px -8px rgba(60,48,36,.14),0 48px 80px -32px rgba(60,48,36,.28);
--dz-shadow-photo:0 30px 60px -30px rgba(52,40,28,.45),0 12px 24px -12px rgba(52,40,28,.2);
--dz-shadow-btn:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(30,28,26,.2),0 6px 14px -6px rgba(30,28,26,.35);
--dz-shadow-header:0 1px 0 rgba(52,55,54,.08),0 8px 24px -16px rgba(60,48,36,.18);
--dz-shadow-inset:inset 0 1px 2px rgba(60,48,36,.08);
--dz-shadow-slab:0 40px 80px -40px rgba(38,40,39,.55);
--dz-ring:0 0 0 3px rgba(211,160,63,.32);
--dz-scrim-hero:linear-gradient(90deg,rgba(26,28,27,.62) 0%,rgba(26,28,27,.32) 48%,rgba(26,28,27,.08) 100%),linear-gradient(180deg,rgba(26,28,27,0) 55%,rgba(26,28,27,.55) 100%);
--dz-scrim-band:linear-gradient(180deg,rgba(32,34,33,.55),rgba(32,34,33,.7));
--dz-scrim-card:linear-gradient(180deg,rgba(32,34,33,0) 35%,rgba(32,34,33,.72) 100%);
--dz-tile-dark:linear-gradient(160deg,rgba(247,243,236,.08),rgba(247,243,236,.02));--dz-tile-dark-hover:linear-gradient(160deg,rgba(247,243,236,.13),rgba(247,243,236,.04));
--dz-tile-dark-edge:inset 0 1px 0 rgba(255,255,255,.07),inset 0 0 0 1px rgba(247,243,236,.08);--dz-tile-dark-lift:0 24px 40px -24px rgba(0,0,0,.6);
--dz-text-shadow:0 1px 12px rgba(0,0,0,.35);--dz-outline-light:rgba(247,243,236,.75);--dz-util-edge:rgba(247,243,236,.18);--dz-on-dark-text:rgba(247,243,236,.84);--dz-on-dark-lead:rgba(247,243,236,.92);--dz-on-dark-soft:rgba(247,243,236,.78);--dz-on-dark-faint:rgba(247,243,236,.6);--dz-well:rgba(247,243,236,.06);--dz-well-edge:rgba(247,243,236,.2);--dz-well-inset:inset 0 1px 2px rgba(0,0,0,.25);--dz-shadow-tile:0 20px 40px -20px rgba(0,0,0,.6);--dz-glow-foot:radial-gradient(60% 50% at 85% 0%,rgba(211,160,63,.10),transparent 70%);--dz-wash:rgba(255,255,255,.5);--dz-disc-dark:rgba(242,220,184,.06);--dz-disc-dark-edge:rgba(242,220,184,.45);--dz-hairline-dark:rgba(247,243,236,.14);--dz-card-edge:inset 0 1px 0 rgba(255,255,255,.8),0 30px 60px -30px rgba(0,0,0,.55);--dz-scrim-header:linear-gradient(180deg,rgba(26,28,27,.55) 0%,rgba(26,28,27,.18) 70%,rgba(26,28,27,0) 100%);--dz-shadow-tab:0 8px 24px -10px rgba(0,0,0,.45);
--dz-action-hover:#1F2120;--dz-scrim-full:rgba(32,34,33,.32);--dz-scrim-hero-page:linear-gradient(90deg,rgba(26,28,27,.64) 0%,rgba(26,28,27,.34) 50%,rgba(26,28,27,.1) 100%),linear-gradient(180deg,rgba(26,28,27,0) 55%,rgba(26,28,27,.55) 100%);--dz-text-shadow-hero:0 2px 30px rgba(0,0,0,.2);--dz-shadow-slab-band:0 40px 80px -40px rgba(38,40,39,.5);--dz-shadow-inverse:0 1px 2px rgba(0,0,0,.2),0 10px 24px -10px rgba(0,0,0,.45);--dz-fill-glass-35:rgba(255,255,255,.35);--dz-fill-light:rgba(247,243,236,.04);--dz-fill-light-hover:rgba(247,243,236,.16);--dz-outline-light-70:rgba(247,243,236,.7);--dz-inset-ring:inset 0 0 0 1px rgba(52,55,54,.06);--dz-glass:rgba(247,243,236,.78);--dz-glass-warm:rgba(251,248,242,.86);--dz-glass-dark:rgba(26,28,27,.28);
--dz-sheen:linear-gradient(180deg,rgba(255,255,255,.65),rgba(255,255,255,0) 40%);
--dz-plaster-tex:radial-gradient(120% 80% at 15% 0%,rgba(255,255,255,.55),transparent 60%),radial-gradient(90% 70% at 100% 100%,rgba(214,196,170,.22),transparent 65%);
--dz-glow:radial-gradient(70% 60% at 0% 0%,rgba(211,160,63,.08),transparent 70%);
--dz-grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .24 0 0 0 0 .2 0 0 0 0 .16 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
--dz-grain-light:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .97 0 0 0 0 .92 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
--dz-grain-opacity:.38;
--dz-size-display:clamp(56px,7vw,104px);--dz-size-hero:clamp(52px,6.2vw,96px);--dz-size-display-l:clamp(44px,5vw,72px);--dz-size-h1:clamp(38px,4vw,56px);--dz-size-h2:clamp(30px,3vw,40px);
--dz-size-h3:28px;--dz-size-h4:22px;--dz-size-lead:22px;--dz-size-body:18px;--dz-size-small:16px;--dz-size-label:13px;--dz-size-micro:12px;
--dz-leading-tight:1.04;--dz-leading-heading:1.15;--dz-leading-body:1.7;--dz-leading-loose:1.8;--dz-tracking-wordmark:.12em;--dz-tracking-display:-.01em;--dz-tracking-label:.22em;--dz-tracking-button:.16em;
--dz-link:var(--dz-terracotta);--dz-link-hover:var(--dz-terracotta-deep);--dz-link-weight:1px;--dz-link-offset:3px;--dz-container:1280px;--dz-text:680px;--dz-header-h:84px;
--dz-section-y:clamp(80px,10vw,144px);--dz-gutter:clamp(20px,4vw,56px);--dz-section-head:clamp(40px,5vw,64px);--dz-slab-gap:clamp(10px,1.4vw,20px);
--dz-r-1:8px;--dz-r-2:18px;--dz-r-3:28px;--dz-r-section:40px;--dz-r-arch:999px 999px 0 0;--dz-r-pill:999px;
--dz-ease:cubic-bezier(.4,0,.2,1);--dz-ease-out:cubic-bezier(.22,.61,.36,1);--dz-dur-fast:160ms;--dz-dur-base:280ms;--dz-dur-slow:700ms;
--dz-display:var(--font-dz-cormorant),Cormorant,'Cormorant Garamond',Georgia,serif;
--dz-sans:var(--font-dz-jost),Jost,Futura,'Century Gothic',system-ui,sans-serif;`

/** The theme's tokens, scoped to a website root carrying data-house-theme="designer". The --color-primary*
 *  family is NOT set here: it is the Space's (designerAccentVars). */
export const DESIGNER_TOKENS_CSS = `
[data-house-theme="designer"][data-site-corners="subtle"]{--dz-r-1:4px;--dz-r-2:10px;--dz-r-3:16px;--dz-r-section:24px}
[data-house-theme="designer"][data-site-corners="square"]{--dz-r-1:0px;--dz-r-2:0px;--dz-r-3:0px;--dz-r-section:0px}
[data-house-theme="designer"][data-site-spacing="balanced"]{--dz-section-y:clamp(64px,7.5vw,104px)}
[data-house-theme="designer"][data-site-spacing="compact"]{--dz-section-y:clamp(48px,5vw,72px)}
@media (prefers-reduced-motion:reduce){[data-house-theme="designer"][data-house-theme]{--dz-dur-fast:0ms;--dz-dur-base:0ms;--dz-dur-slow:0ms}}
[data-house-theme="designer"]{color-scheme:light;${DESIGNER_VARS}
--color-canvas:var(--dz-plaster);--color-marketing-canvas:var(--dz-plaster);--color-surface:var(--dz-parchment);--color-surface-elevated:var(--dz-paper);--color-surface-post:var(--dz-parchment);--color-surface-hover:var(--dz-linen);
--color-chrome:var(--dz-glass);--color-chrome-border:var(--dz-line);--color-chrome-hover:var(--dz-linen);--color-scrim:rgb(26 28 27 / 0.42);
--color-border:var(--dz-line);--color-border-strong:var(--dz-line-strong);--color-rule:var(--dz-line);
--color-text:var(--dz-charcoal);--color-text-muted:var(--dz-stone);--color-text-subtle:var(--dz-stone);--color-text-disabled:var(--dz-disabled);
--color-ink:var(--dz-ink);--color-ink-elevated:var(--dz-charcoal);--color-ink-border:var(--dz-rule-dark);--color-on-ink:var(--dz-plaster);--color-on-ink-muted:var(--dz-on-dark-muted);--color-on-ink-subtle:var(--dz-on-dark-faint);
--color-accent:var(--color-primary);--color-accent-hover:var(--color-primary-hover);--color-accent-strong:var(--color-primary-strong);--color-accent-bg:var(--color-primary-bg);--color-text-on-accent:var(--color-text-on-primary);
--color-signal:var(--dz-success);--color-signal-strong:var(--dz-success-deep);--color-signal-bg:var(--dz-success-soft);--color-text-on-signal:var(--dz-paper);
--color-broadcast:var(--dz-sage-deep);--color-broadcast-strong:var(--dz-sage-ink);--color-broadcast-bg:var(--dz-sage-soft);--color-text-on-broadcast:var(--dz-paper);
--color-success:var(--dz-success);--color-success-bg:var(--dz-success-soft);--color-text-on-success:var(--dz-paper);
--color-warning:var(--dz-ochre-deep);--color-warning-bg:var(--dz-sand-soft);
--color-danger:var(--dz-error);--color-danger-bg:var(--dz-error-soft);--color-text-on-danger:var(--dz-paper);
--color-info:var(--dz-sage-deep);--color-info-bg:var(--dz-info-soft);--color-move:var(--dz-sage-deep);--color-move-bg:var(--dz-sage-soft);
--color-focus-ring:var(--dz-ochre);--color-selection:var(--dz-sand);--color-on-media:var(--dz-plaster);--gradient-media-protect:var(--dz-scrim-card);
--font-display:var(--dz-display);--font-heading:var(--dz-display);--font-body:var(--dz-sans);--font-mono:var(--dz-sans);--font-label:var(--dz-sans);--font-sans:var(--dz-sans);
--radius-card:var(--dz-r-2);--radius-control:var(--dz-r-1);--radius-cover:var(--dz-r-3);--radius-media:var(--dz-r-3);--radius-pill:var(--dz-r-pill);
--space-section:var(--dz-section-y);--space-section-tight:var(--dz-section-head);--space-gutter:var(--dz-gutter);
--motion-fast:var(--dz-dur-fast);--motion-base:var(--dz-dur-base);--motion-slow:var(--dz-dur-slow);--ease-out:var(--dz-ease-out);--ease-in-out:var(--dz-ease);
--shadow-float:var(--dz-shadow-3);--shadow-menu:var(--dz-shadow-3);
--text-display-hero:clamp(3.25rem,6.2vw,6rem);--text-display-h1:clamp(2.75rem,5vw,4.5rem);--text-display-h2:clamp(2.375rem,4vw,3.5rem);--text-display-h3:clamp(1.875rem,3vw,2.5rem);--text-display-card:1.75rem;--text-stat:clamp(2.75rem,5vw,4.25rem);
--text-page-title:2.5rem;--text-lead:1.375rem;--text-card-title:1.125rem;--text-body:1.125rem;--text-body-sm:1rem;--text-meta:.875rem;--text-eyebrow:.8125rem;--text-2xs:.75rem;
--weight-heading:400;--leading-display:1.04;--leading-snug:1.25;--leading-normal:1.55;--leading-relaxed:1.7;
--tracking-display:-0.01em;--tracking-tight:-0.005em;--tracking-label:.22em;--tracking-eyebrow:.22em;
--th-bg:var(--color-canvas);--th-surface:var(--color-surface);--th-raised:var(--color-surface-elevated);--th-hairline:var(--color-border);--th-muted:var(--color-text-subtle);--th-secondary:var(--color-text-muted);--th-text:var(--color-text);
--th-accent:var(--color-accent);--th-accent-text:var(--color-accent-strong);--th-on-accent:var(--color-text-on-accent);--th-season:var(--dz-terracotta);--th-on-season:var(--dz-plaster);--th-dw:400;--th-r:var(--radius-card);
--mn-solid:var(--dz-charcoal);--mn-solid-hover:var(--dz-action-hover);--mn-on-solid:var(--dz-plaster);
background:var(--color-canvas);color:var(--color-text);font-family:var(--dz-sans)}
${DESIGNER_KIT_TOKENS_CSS}[data-house-theme="designer"] ::selection{background:var(--dz-sand)}
`
