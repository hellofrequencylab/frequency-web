// THE MIDNIGHT THEME, for frequency-web. Drop-in at lib/theme/midnight.ts. PURE.
// Built from the Midnight design system (Claude Design project "Frequency Midnight Design System").
// Modelled line for line on lib/theme/temple.ts: the palette, the accent rule, the --mn-* vocabulary and the
// scoped token block a website wears under [data-house-theme="midnight"].
//
// The standard, "a house after dark":
//   · True black grounds, bone ink (never pure white), one violet accent for live states, focus and one
//     highlight per view. Ember is the only warm note (season, warnings). Moss, frost and blood are semantic.
//   · Square and architectural: cards and photos are square, controls barely softened, chips and avatars are
//     pills. The ARCH (a tall dome) is reserved for one feature photo per page.
//   · Bodoni Moda for display and numerals (roman + italic), Marcellus for every label (uppercase, .18em to
//     .22em), Geist for body and UI. Photography is black and white.
//   · Elevation on black is light, not shadow: a step up in surface plus a hairline. Mist, smoke and grain
//     are the textures; one per section. Reduced motion stops all drift.
//
// Contrast (measured on --mn-night-50 #050505): bone-50 17.6:1 · ash-200 8.0:1 · ash-300 5.9:1 (the floor for
// readable text) · violet-400 7.9:1 · black-50 on violet-400 7.9:1.

import { HEX_ACCENT, contrastRatio, type AccentVars } from '@/lib/spaces/accent'
import contract from '@/lib/sites/editor/theme-contract.json'

/** The violet family lives in the editor contract (lib/sites/editor/theme-contract.json), the one file the
 *  violet-family probe lets carry a brand palette. The accent is a single swap there: it waits on the owner's
 *  call, so nothing here spells it. */
const MIDNIGHT_CONTRACT = contract.themes.Midnight

/** The palette, as the design system's tokens/colors.css names it. */
export const MIDNIGHT_PALETTE = {
  black0: '#000000', black50: '#050505', black100: '#0B0B0B', black150: '#111111', black200: '#171717', black300: '#1F1F1F', black400: '#2A2A2A', black500: '#3A3A3A',
  ash400: '#6E6A63', ash300: '#8C877E', ash200: '#A7A196',
  bone100: '#D9D3C7', bone50: '#EDE8DF', bone0: '#F7F4EE',
  violet300: MIDNIGHT_CONTRACT['--th-accent-text'], violet400: MIDNIGHT_CONTRACT['--th-accent'], violet500: MIDNIGHT_CONTRACT['--th-accent-deep'], violet900: MIDNIGHT_CONTRACT['--th-accent-bg'],
  ember300: '#F2BF73', ember400: '#E5A04B', ember500: '#C98431', ember900: '#2A1C0C',
  blood400: '#C2453A', blood900: '#2A0F0C', moss400: '#7FA88A', moss900: '#142019', frost400: '#8FA9C4', frost900: '#121A23',
} as const

const P = MIDNIGHT_PALETTE

/** The violet, its text shade on black, and the label that reads on it. */
export const MIDNIGHT_ACCENT = { accent: P.violet400, text: P.violet300, on: P.black50, bg: P.violet900 } as const

/** Frequency's season contract: winter frost, spring moss, summer ember, fall deep ember. */
export const MIDNIGHT_SEASONS = { winter: P.frost400, spring: P.moss400, summer: P.ember400, fall: P.ember500 } as const

/** The Space's --color-primary* family on a Midnight website. No accent, or the violet itself: the measured
 *  violet. Any other hex: that hex, a lighter text shade for links on black, and a label that reads on it
 *  (black when it clears AA, else bone). On Midnight the accent is a highlight, never the page's solid
 *  button; the bone solid button reads --mn-solid. */
export function midnightAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === MIDNIGHT_ACCENT.accent) {
    return {
      '--color-primary': MIDNIGHT_ACCENT.accent,
      '--color-primary-hover': MIDNIGHT_ACCENT.text,
      '--color-primary-strong': MIDNIGHT_ACCENT.text,
      '--color-primary-bg': MIDNIGHT_ACCENT.bg,
      '--color-text-on-primary': MIDNIGHT_ACCENT.on,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': `color-mix(in srgb, ${accent} 70%, white)`,
    '--color-primary-strong': `color-mix(in srgb, ${accent} 70%, white)`, // links on black read lighter, not darker
    '--color-primary-bg': `color-mix(in srgb, ${accent} 16%, ${P.black50})`,
    '--color-text-on-primary': contrastRatio(P.black50, accent) >= 4.5 ? P.black50 : P.bone0,
  }
}

/** Everything the skin reads. midnight-css.ts uses these and the DAWN --color-* set only. */
const MIDNIGHT_VARS = `
--mn-night-0:${P.black0};--mn-night-50:${P.black50};--mn-night-100:${P.black100};--mn-night-150:${P.black150};--mn-night-200:${P.black200};--mn-night-300:${P.black300};--mn-night-400:${P.black400};--mn-night-500:${P.black500};
--mn-ash-400:${P.ash400};--mn-ash-300:${P.ash300};--mn-ash-200:${P.ash200};--mn-bone-100:${P.bone100};--mn-bone-50:${P.bone50};--mn-bone-0:${P.bone0};
--mn-violet-300:${P.violet300};--mn-violet-400:${P.violet400};--mn-violet-500:${P.violet500};--mn-violet-900:${P.violet900};
--mn-ember-300:${P.ember300};--mn-ember-400:${P.ember400};--mn-ember-500:${P.ember500};--mn-ember-900:${P.ember900};
--mn-blood-400:${P.blood400};--mn-blood-900:${P.blood900};--mn-moss-400:${P.moss400};--mn-moss-900:${P.moss900};--mn-frost-400:${P.frost400};--mn-frost-900:${P.frost900};
--mn-solid:var(--mn-bone-50);--mn-solid-hover:var(--mn-bone-0);--mn-on-solid:var(--mn-night-50);
--mn-rule:rgba(237,232,223,.14);--mn-scrim:rgba(0,0,0,.72);--mn-glass:rgba(5,5,5,.72);--mn-selection:color-mix(in srgb,var(--mn-violet-400) 32%,transparent);
--mn-media-protect:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.78) 100%);
--mn-shadow-float:0 0 0 1px var(--mn-night-300),0 24px 48px -12px rgba(0,0,0,.9);
--mn-shadow-menu:0 0 0 1px var(--mn-night-500),0 18px 40px -16px rgba(0,0,0,.95);
--mn-glow:0 0 0 1px color-mix(in srgb,var(--mn-violet-400) 50%,transparent),0 0 24px -4px color-mix(in srgb,var(--mn-violet-400) 45%,transparent);
--mn-blur:blur(14px) saturate(1.1);
--mn-size-eyebrow:.6875rem;--mn-size-meta:.75rem;--mn-size-body-sm:.875rem;--mn-size-body:1rem;--mn-size-lead:1.25rem;
--mn-size-h3:clamp(1.75rem,3vw,2.5rem);--mn-size-h2:clamp(2.25rem,4.5vw,3.75rem);--mn-size-h1:clamp(3rem,6.5vw,5.75rem);--mn-size-hero:clamp(3.5rem,9vw,8.5rem);
--mn-leading-display:1;--mn-leading-snug:1.2;--mn-leading-body:1.65;--mn-tracking-display:-.02em;--mn-tracking-label:.18em;--mn-tracking-eyebrow:.22em;
--mn-section-y:clamp(5rem,10vw,9rem);--mn-section-tight:clamp(3rem,6vw,5rem);--mn-gutter:clamp(1.25rem,4vw,3rem);--mn-measure:66ch;
--mn-r-card:0px;--mn-r-control:2px;--mn-r-pill:9999px;--mn-r-arch:50% 50% 0 0 / 28% 28% 0 0;
--mn-ease:cubic-bezier(.22,1,.36,1);--mn-ease-in-out:cubic-bezier(.65,0,.35,1);--mn-dur-fast:140ms;--mn-dur-base:320ms;--mn-dur-slow:900ms;
--mn-display:var(--font-mn-bodoni),'Bodoni Moda',Didot,'Bodoni 72',Georgia,serif;
--mn-label:var(--font-mn-marcellus),Marcellus,'Trajan Pro',Georgia,serif;
--mn-sans:var(--font-mn-geist),Geist,ui-sans-serif,system-ui,sans-serif;`

/** The theme's tokens, scoped to a website root carrying data-house-theme="midnight". The --color-primary*
 *  family is NOT set here: it is the Space's (AccentScope, midnightAccentVars). The design system's own
 *  --color-accent* follows it, so the DS components and the house blocks share one accent. */
export const MIDNIGHT_TOKENS_CSS = `
[data-house-theme="midnight"]{color-scheme:dark;${MIDNIGHT_VARS}
--color-canvas:var(--mn-night-50);--color-marketing-canvas:var(--mn-night-0);--color-surface:var(--mn-night-100);--color-surface-elevated:var(--mn-night-200);--color-surface-post:var(--mn-night-100);--color-surface-hover:var(--mn-night-150);
--color-chrome:var(--mn-glass);--color-chrome-border:var(--mn-night-300);--color-chrome-hover:var(--mn-night-200);--color-scrim:var(--mn-scrim);
--color-border:var(--mn-night-300);--color-border-strong:var(--mn-night-500);--color-rule:var(--mn-rule);
--color-text:var(--mn-bone-50);--color-text-muted:var(--mn-ash-200);--color-text-subtle:var(--mn-ash-300);--color-text-disabled:var(--mn-ash-400);
--color-ink:var(--mn-bone-50);--color-ink-elevated:var(--mn-bone-100);--color-ink-border:#CFC8BA;--color-on-ink:var(--mn-night-100);--color-on-ink-muted:#4A463F;--color-on-ink-subtle:#5C574F;
--color-accent:var(--color-primary);--color-accent-hover:var(--color-primary-hover);--color-accent-strong:var(--color-primary-strong);--color-accent-bg:var(--color-primary-bg);--color-text-on-accent:var(--color-text-on-primary);
--color-signal:var(--mn-moss-400);--color-signal-strong:var(--mn-moss-400);--color-signal-bg:var(--mn-moss-900);--color-text-on-signal:var(--mn-night-50);
--color-broadcast:var(--mn-frost-400);--color-broadcast-strong:var(--mn-frost-400);--color-broadcast-bg:var(--mn-frost-900);--color-text-on-broadcast:var(--mn-night-50);
--color-success:var(--mn-moss-400);--color-success-bg:var(--mn-moss-900);--color-text-on-success:var(--mn-night-50);
--color-warning:var(--mn-ember-400);--color-warning-bg:var(--mn-ember-900);
--color-danger:var(--mn-blood-400);--color-danger-bg:var(--mn-blood-900);--color-text-on-danger:var(--mn-bone-0);
--color-info:var(--mn-frost-400);--color-info-bg:var(--mn-frost-900);
--color-focus-ring:var(--color-primary);--color-selection:var(--mn-selection);--color-on-media:var(--mn-bone-0);--gradient-media-protect:var(--mn-media-protect);
--font-display:var(--mn-display);--font-heading:var(--mn-display);--font-body:var(--mn-sans);--font-mono:var(--mn-label);--font-label:var(--mn-label);--font-sans:var(--mn-sans);
--radius-card:var(--mn-r-card);--radius-control:var(--mn-r-control);--radius-cover:var(--mn-r-card);--radius-media:var(--mn-r-card);--radius-pill:var(--mn-r-pill);
--space-section:var(--mn-section-y);--space-section-tight:var(--mn-section-tight);--space-gutter:var(--mn-gutter);
--motion-fast:var(--mn-dur-fast);--motion-base:var(--mn-dur-base);--motion-slow:var(--mn-dur-slow);--ease-out:var(--mn-ease);--ease-in-out:var(--mn-ease-in-out);
--shadow-float:var(--mn-shadow-float);--shadow-menu:var(--mn-shadow-menu);
background:var(--color-canvas);color:var(--color-text);font-family:var(--mn-sans)}
[data-house-theme="midnight"][data-site-corners="soft"]{--mn-r-card:14px;--mn-r-control:8px}
[data-house-theme="midnight"][data-site-corners="subtle"]{--mn-r-card:6px;--mn-r-control:4px}
[data-house-theme="midnight"][data-site-corners="square"]{--mn-r-card:0px;--mn-r-control:2px}
[data-house-theme="midnight"][data-site-spacing="balanced"]{--mn-section-y:clamp(4rem,7.5vw,7rem);--mn-section-tight:clamp(2.5rem,5vw,4rem)}
[data-house-theme="midnight"][data-site-spacing="compact"]{--mn-section-y:clamp(3rem,5vw,5rem);--mn-section-tight:clamp(2rem,4vw,3rem)}
[data-house-theme="midnight"] ::selection{background:var(--mn-selection);color:var(--mn-bone-0)}
@media (prefers-reduced-motion:reduce){[data-house-theme="midnight"]{--mn-dur-fast:0ms;--mn-dur-base:0ms;--mn-dur-slow:0ms}}
`
