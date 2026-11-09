import { HEX_ACCENT, contrastRatio, type AccentVars } from "@/lib/spaces/accent";
import type { ThemeSurface } from "@/lib/theme/surface-vars";
// THE NEW WORLD THEME (code id `new-world`, editor theme `NewWorld`), built from the New World design system
// (docs/design-systems/new-world, revision 2). PURE. New World is the mega template every new Space starts in. It is
// its own theme, separate from Services. Night (Stage) is the default register; Day (Commons, `data-th="day"`) is the
// light one, and either can be set on a section so a page mixes them. The tokens are --nw-* so they never meet another
// theme's; the engine's own names (--th-*) come from the theme contract (themes.NewWorld).
//
// Scope: these tokens live under [data-house-theme="new-world"] and are only ever emitted by the stand-alone site
// render. A site theme never styles a member, Space console or admin area (ADR-1906).
//
// Three deliberate differences from the zip, recorded in docs/design-systems/new-world/rules.json:
//  - The starting accent is Tide teal (Daniel, 2026-11-03), so the flare ramps are Tide, not the zip's violet.
//  - The Stage inks are Frequency's own slate, not the zip's violet-tinted scale (the violet family is retired, ADR-1792).
//  - Filled accent buttons carry white labels in both registers (Daniel, 2026-11-04); the zip's Night --text-on-accent was ink.

/** The owner accent presets that ship now (Tide, Signal, Bloom, Ember, Fern). Tide is the starting accent. Id to the steps the site engine reads. */
export const NEW_WORLD_ACCENTS = {
  tide: {
    label: "Tide",
    accent: "#1AA7C0",
    hover: "#12879E",
    text: "#3FC1D6",
    soft: "#0C5F70",
    deep: "#8EDBE8",
    glow2: "#FF3DAE",
    glow3: "#2FDCEE",
  },
  // Signal, Bloom, Ember and Fern reuse the Services preset values (owner, 2026-11-03: no violet, so no Iris).
  signal: {
    label: "Signal",
    accent: "#2F7CF6",
    hover: "#1F60CC",
    text: "#6AA2FF",
    soft: "#164593",
    deep: "#A9C8FF",
    glow2: "#22B8D6",
    glow3: "#40AAFF",
  },
  bloom: {
    label: "Bloom",
    accent: "#F05A73",
    hover: "#CC3F58",
    text: "#FF8398",
    soft: "#8F2A3C",
    deep: "#FFB8C3",
    glow2: "#FF9466",
    glow3: "#FF9F5A",
  },
  ember: {
    label: "Ember",
    accent: "#F2643A",
    hover: "#CC4A22",
    text: "#FF9068",
    soft: "#8F3316",
    deep: "#FFC2A8",
    glow2: "#F2557A",
    glow3: "#FF9F5A",
  },
  fern: {
    label: "Fern",
    accent: "#1FAF6E",
    hover: "#168C57",
    text: "#4FD394",
    soft: "#0F5E3B",
    deep: "#9CE8C2",
    glow2: "#2BB3A6",
    glow3: "#8FD94A",
  },
} as const;

export type NewWorldAccentId = keyof typeof NEW_WORLD_ACCENTS;

/** Filled accent buttons carry white labels in both registers (Daniel, 2026-11-04: accent buttons carry white labels; ink only on a
 *  very light accent). The zip's Night --text-on-accent was ink; that is overridden here on purpose. */
export const NEW_WORLD_ON_ACCENT = "#FFFFFF";
/** The label on an owner accent too light for white (white under 2:1 on it). */
const NEW_WORLD_INK_ON_ACCENT = "#0A0E16";

/** The design system's token block: the plain scale first (compared value for value by the intake), then the Night register. */
export const NEW_WORLD_TOKENS_CSS = `
[data-house-theme="new-world"]{
--nw-iridescent-sweep:linear-gradient(100deg,#8FE9FF 0%,#A3D4FF 20%,#A3D4FF 34%,#8FE9FF 52%,#A3E8D4 72%,#A3D4FF 88%,#8FE9FF 100%);
--nw-iridescent-sweep-deep:linear-gradient(100deg,#2C93A3 0%,#5A9FD0 26%,#5A9FD0 44%,#2C93A3 64%,#3C9C8C 82%,#2C93A3 100%);
--nw-n-flare-300:#8EDBE8;
--nw-n-flare-400:#3FC1D6;
--nw-n-flare-500:#1AA7C0;
--nw-n-flare-600:#12879E;
--nw-n-flare-700:#0C5F70;
--nw-n-swell-300:#FF8CC8;
--nw-n-swell-500:#FF3DAE;
--nw-n-halo-300:#7FE9FA;
--nw-n-halo-500:#2FDCEE;
--nw-d-flare-300:#5BB4C4;
--nw-d-flare-400:#2F96AA;
--nw-d-flare-500:#12768B;
--nw-d-flare-600:#0D6074;
--nw-d-flare-700:#0A4A5A;
--nw-d-swell-300:#D15A9C;
--nw-d-swell-500:#B13C7E;
--nw-d-halo-300:#3F9CAA;
--nw-d-halo-500:#1E7F8D;
--nw-salt-50:#FBF7F0;
--nw-salt-100:#F5EDE1;
--nw-salt-300:#D8C4A6;
--nw-salt-700:#6B625A;
--nw-text-on-light:#1E1B18;
--nw-text-on-light-muted:var(--nw-salt-700);
--nw-surface-light:var(--nw-salt-50);
--nw-surface-light-sunken:var(--nw-salt-100);
--nw-grad-sunset:var(--nw-iridescent-sweep);
--nw-space-1:4px;
--nw-space-2:8px;
--nw-space-3:12px;
--nw-space-4:16px;
--nw-space-5:24px;
--nw-space-6:32px;
--nw-space-7:48px;
--nw-space-8:64px;
--nw-space-9:96px;
--nw-space-10:144px;
--nw-container-max:1320px;
--nw-gutter:clamp(20px,4vw,56px);
--nw-frame:calc(var(--nw-container-max) + 2 * var(--nw-gutter));
--nw-radius-none:0;
--nw-radius-sm:6px;
--nw-radius-md:12px;
--nw-radius-lg:20px;
--nw-radius-xl:28px;
--nw-radius-pill:999px;
--nw-border-hairline:1px;
--nw-ease-out:cubic-bezier(.16,1,.3,1);
--nw-ease-tide:cubic-bezier(.65,0,.35,1);
--nw-dur-fast:150ms;
--nw-dur-base:300ms;
--nw-dur-slow:800ms;
--nw-stretch-display:100%;
--nw-fs-display-xl:96px;
--nw-fs-display-l:64px;
--nw-fs-display-m:48px;
--nw-fs-h1:44px;
--nw-fs-h2:30px;
--nw-fs-h3:22px;
--nw-fs-h4:18px;
--nw-fs-body-l:19px;
--nw-fs-body:16px;
--nw-fs-body-s:14px;
--nw-fs-caption:13px;
--nw-fs-mono:11px;
--nw-lh-display:0.98;
--nw-lh-snug:1.15;
--nw-lh-body:1.55;
--nw-ls-display:-0.035em;
--nw-ls-mono:0.14em;
--nw-ls-button:0.08em;
--nw-fw-regular:400;
--nw-fw-medium:500;
--nw-fw-bold:600;
--nw-fw-heavy:700;
--nw-fw-display:600;
--nw-em-size:1.06em;
}
[data-house-theme="new-world"],[data-house-theme="new-world"] [data-th]{
--nw-ink-950:#05070C;
--nw-ink-900:#0A0E16;
--nw-ink-850:#111826;
--nw-ink-800:#1A2233;
--nw-ink-700:#262F44;
--nw-ink-600:#35415B;
--nw-graphite-400:#98A6BC;
--nw-chrome-50:#F2F5FA;
--nw-chrome-200:#C9D3E0;
--nw-chrome-400:#98A6BC;
--nw-flare-300:var(--nw-n-flare-300);
--nw-flare-400:var(--nw-n-flare-400);
--nw-flare-500:var(--nw-n-flare-500);
--nw-flare-600:var(--nw-n-flare-600);
--nw-flare-700:var(--nw-n-flare-700);
--nw-swell-300:var(--nw-n-swell-300);
--nw-swell-500:var(--nw-n-swell-500);
--nw-swell-700:#B0287F;
--nw-halo-300:var(--nw-n-halo-300);
--nw-halo-500:var(--nw-n-halo-500);
--nw-success-500:#7CC97F;
--nw-warning-500:#FFC46B;
--nw-danger-500:#FF6A5B;
--nw-text-accent:var(--nw-flare-400);
--nw-accent-hover:var(--nw-flare-400);
--nw-accent-text:#FFFFFF;
--nw-text-on-accent:#FFFFFF;
--nw-action-primary:var(--nw-chrome-50);
--nw-action-primary-text:var(--nw-ink-900);
--nw-action-primary-hover:#FFFFFF;
--nw-action-glow:0 0 24px color-mix(in oklab,var(--nw-flare-500) 55%,transparent),0 0 64px color-mix(in oklab,var(--nw-swell-500) 30%,transparent);
--nw-focus-ring:var(--nw-halo-500);
--nw-text-link:var(--nw-flare-300);
--nw-text-link-hover:var(--nw-chrome-50);
--nw-sheen:linear-gradient(180deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 38%);
--nw-surface-glass:color-mix(in oklab,var(--nw-ink-800) 55%,transparent);
--nw-glass-panel:linear-gradient(150deg,color-mix(in oklab,var(--nw-ink-800) 70%,transparent),color-mix(in oklab,var(--nw-ink-800) 45%,transparent));
--nw-glass-panel-shadow:0 20px 50px -30px rgba(0,0,0,.6),inset 0 0 0 1px color-mix(in oklab,var(--nw-chrome-50) 9%,transparent);
--nw-tip-bg:color-mix(in oklab,var(--nw-chrome-50) 94%,transparent);
--nw-reward:#FFC46B;
--nw-reward-soft:rgba(255,196,107,.14);
--nw-pa:linear-gradient(120deg,var(--nw-swell-300) 0%,var(--nw-flare-300) 36%,var(--nw-halo-300) 100%);
--nw-pa-glow:0 0 22px color-mix(in oklab,var(--nw-flare-400) 35%,transparent);
--nw-aura-opacity:.6;
--nw-glow-strength:1;
--nw-logo-filter:invert(1);
--nw-depth-sm:0 1px 0 rgba(255,255,255,.06) inset,0 1px 2px rgba(0,0,0,.4);
--nw-depth-md:0 1px 0 rgba(255,255,255,.08) inset,0 18px 40px -16px rgba(0,0,0,.7);
--nw-depth-lg:0 1px 0 rgba(255,255,255,.1) inset,0 40px 80px -24px rgba(0,0,0,.8);
--nw-grad-lit:linear-gradient(100deg,var(--nw-halo-300) 0%,var(--nw-chrome-50) 30%,var(--nw-swell-300) 55%,var(--nw-flare-400) 78%,var(--nw-halo-300) 100%);
--nw-sp:1.15;
--nw-surface-page:var(--nw-surface-page-base,var(--nw-ink-900));
--nw-surface-sunken:var(--nw-ink-950);
--nw-surface-raised:var(--nw-ink-850);
--nw-surface-card:var(--nw-ink-800);
--nw-text-primary:var(--nw-chrome-50);
--nw-text-secondary:var(--nw-chrome-200);
--nw-text-muted:var(--nw-graphite-400);
--nw-border-subtle:color-mix(in oklab,var(--nw-chrome-50) 9%,transparent);
--nw-border-default:color-mix(in oklab,var(--nw-chrome-50) 18%,transparent);
--nw-border-strong:color-mix(in oklab,var(--nw-chrome-50) 50%,transparent);
--nw-border-light:color-mix(in oklab,#1E1B18 12%,transparent);
--nw-accent:var(--nw-flare-500);
--nw-accent-tint:color-mix(in oklab,var(--nw-flare-500) 14%,transparent);
--nw-glow-sunset:linear-gradient(to top left,color-mix(in oklab,var(--nw-flare-500) calc(85% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-flare-500) calc(59% * var(--nw-sp)),var(--nw-ink-900)) 22%,color-mix(in oklab,var(--nw-flare-500) calc(34% * var(--nw-sp)),var(--nw-ink-900)) 48%,color-mix(in oklab,var(--nw-flare-500) calc(12% * var(--nw-sp)),var(--nw-ink-900)) 72%,transparent 92%);
--nw-spread-tr:linear-gradient(to bottom left,color-mix(in oklab,var(--nw-flare-500) calc(75% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-flare-500) calc(53% * var(--nw-sp)),var(--nw-ink-900)) 22%,color-mix(in oklab,var(--nw-flare-500) calc(30% * var(--nw-sp)),var(--nw-ink-900)) 48%,color-mix(in oklab,var(--nw-flare-500) calc(11% * var(--nw-sp)),var(--nw-ink-900)) 72%,transparent 92%);
--nw-spread-tl:linear-gradient(to bottom right,color-mix(in oklab,var(--nw-flare-500) calc(60% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-flare-500) calc(42% * var(--nw-sp)),var(--nw-ink-900)) 22%,color-mix(in oklab,var(--nw-flare-500) calc(24% * var(--nw-sp)),var(--nw-ink-900)) 48%,color-mix(in oklab,var(--nw-flare-500) calc(8% * var(--nw-sp)),var(--nw-ink-900)) 72%,transparent 92%);
--nw-spread-br:linear-gradient(to top left,color-mix(in oklab,var(--nw-halo-500) calc(60% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-halo-500) calc(42% * var(--nw-sp)),var(--nw-ink-900)) 22%,color-mix(in oklab,var(--nw-halo-500) calc(24% * var(--nw-sp)),var(--nw-ink-900)) 48%,color-mix(in oklab,var(--nw-halo-500) calc(8% * var(--nw-sp)),var(--nw-ink-900)) 72%,transparent 92%);
--nw-spread-bl:linear-gradient(to top right,color-mix(in oklab,var(--nw-swell-500) calc(55% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-swell-500) calc(39% * var(--nw-sp)),var(--nw-ink-900)) 22%,color-mix(in oklab,var(--nw-swell-500) calc(22% * var(--nw-sp)),var(--nw-ink-900)) 48%,color-mix(in oklab,var(--nw-swell-500) calc(8% * var(--nw-sp)),var(--nw-ink-900)) 72%,transparent 92%);
--nw-spread-bottom:linear-gradient(to top,color-mix(in oklab,var(--nw-flare-500) calc(80% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-flare-500) calc(45% * var(--nw-sp)),var(--nw-ink-900)) 28%,color-mix(in oklab,var(--nw-flare-500) calc(16% * var(--nw-sp)),var(--nw-ink-900)) 58%,transparent 88%);
--nw-spread-top:linear-gradient(to bottom,color-mix(in oklab,var(--nw-flare-500) calc(42% * var(--nw-sp)),var(--nw-ink-900)) 0%,color-mix(in oklab,var(--nw-flare-500) calc(18% * var(--nw-sp)),var(--nw-ink-900)) 32%,transparent 75%);
--nw-overlay-scrim:linear-gradient(90deg,color-mix(in oklab,var(--nw-ink-950) 90%,transparent) 0%,color-mix(in oklab,var(--nw-ink-950) 60%,transparent) 45%,color-mix(in oklab,var(--nw-ink-950) 20%,transparent) 100%);
--nw-overlay-bottom:linear-gradient(180deg,color-mix(in oklab,var(--nw-ink-950) 0%,transparent) 35%,color-mix(in oklab,var(--nw-ink-950) 95%,transparent) 100%);
--nw-bg-canvas:var(--nw-ink-900);
--nw-bg-sunken:var(--nw-ink-950);
--nw-text-strong:var(--nw-chrome-50);
--nw-text-body:var(--nw-chrome-200);
--nw-text-faint:color-mix(in oklab,var(--nw-graphite-400) 70%,var(--nw-ink-900));
--nw-border-hair:var(--nw-border-subtle);
--nw-track:var(--nw-border-subtle);
--nw-accent-soft:var(--nw-accent-tint);
--nw-accent-2:var(--nw-halo-500);
--nw-live:var(--nw-swell-500);
--nw-live-soft:color-mix(in oklab,var(--nw-swell-500) 16%,transparent);
--nw-presence:var(--nw-halo-500);
--nw-presence-soft:color-mix(in oklab,var(--nw-halo-500) 14%,transparent);
--nw-pa-soft:linear-gradient(120deg,color-mix(in oklab,var(--nw-swell-300) 18%,transparent),color-mix(in oklab,var(--nw-flare-300) 16%,transparent) 50%,color-mix(in oklab,var(--nw-halo-300) 16%,transparent));
--nw-wash:radial-gradient(60% 50% at 6% 0%,color-mix(in oklab,var(--nw-flare-500) 14%,transparent),transparent 70%),radial-gradient(50% 50% at 98% 14%,color-mix(in oklab,var(--nw-halo-500) 10%,transparent),transparent 70%);
--nw-amb-1:color-mix(in oklab,var(--nw-flare-400) 18%,transparent);
--nw-amb-2:color-mix(in oklab,var(--nw-flare-300) 16%,transparent);
--nw-amb-3:color-mix(in oklab,var(--nw-swell-300) 14%,transparent);
--nw-amb-4:color-mix(in oklab,var(--nw-halo-300) 16%,transparent);
--nw-aura-1:var(--nw-flare-500);
--nw-aura-2:var(--nw-swell-500);
--nw-aura-3:var(--nw-halo-500);
--nw-shadow-glow:0 10px 40px -10px color-mix(in oklab,var(--nw-flare-500) 55%,transparent);
}`;

/** The Day register (Commons): flips the ink and chrome scales so every surface in the section follows. */
export const NEW_WORLD_DAY_CSS = `
[data-house-theme="new-world"][data-th="day"],[data-house-theme="new-world"] [data-th="day"]{
--nw-ink-950:#F7F6F3;
--nw-ink-900:#FFFFFF;
--nw-ink-850:#FFFFFF;
--nw-ink-800:#FDFCFA;
--nw-ink-700:#EFECE7;
--nw-ink-600:#DDD8D0;
/* BLD-901: Commons muted ink at day (#7C766F) reads 4.49:1 on white, under AA for small text; the deeper step is the one frequency.css already standardised (5.50:1 on white). */
--nw-graphite-400:#6E6862;
--nw-chrome-50:#34312E;
--nw-chrome-200:#4D4945;
--nw-chrome-400:#6E6862;
--nw-flare-300:var(--nw-d-flare-300);
--nw-flare-400:var(--nw-d-flare-400);
--nw-flare-500:var(--nw-d-flare-500);
--nw-flare-600:var(--nw-d-flare-600);
--nw-flare-700:var(--nw-d-flare-700);
--nw-swell-300:var(--nw-d-swell-300);
--nw-swell-500:var(--nw-d-swell-500);
--nw-swell-700:#8E1F66;
--nw-halo-300:var(--nw-d-halo-300);
--nw-halo-500:var(--nw-d-halo-500);
--nw-success-500:#2F7F5A;
--nw-warning-500:#A86A00;
--nw-danger-500:#C2362B;
--nw-text-accent:var(--nw-flare-500);
--nw-accent-hover:var(--nw-flare-600);
--nw-accent-text:#FFFFFF;
--nw-text-on-accent:#FFFFFF;
--nw-action-primary:#1E1B18;
--nw-action-primary-text:#FFFFFF;
--nw-action-primary-hover:#000000;
--nw-action-glow:0 6px 18px -8px rgba(30,27,24,.4);
--nw-focus-ring:var(--nw-flare-500);
--nw-text-link:var(--nw-flare-500);
--nw-text-link-hover:var(--nw-chrome-50);
--nw-sheen:linear-gradient(180deg,rgba(255,255,255,.9) 0%,rgba(255,255,255,0) 38%);
--nw-surface-glass:rgba(255,255,255,.74);
--nw-glass-panel:linear-gradient(150deg,rgba(255,255,255,.72),rgba(255,255,255,.36));
--nw-glass-panel-shadow:0 1px 2px rgba(60,40,20,.04),0 24px 50px -36px rgba(80,50,20,.32),inset 0 0 0 1px rgba(255,255,255,.8);
--nw-tip-bg:rgba(52,49,46,.92);
--nw-reward:#9A6200;
--nw-reward-soft:#FFF0D6;
--nw-pa:linear-gradient(120deg,#EEC1EC 0%,#BFD2FF 36%,#A3D4FF 68%,#8FE9FF 100%);
--nw-pa-glow:0 12px 28px -14px rgba(120,150,225,.55);
--nw-aura-opacity:.85;
--nw-glow-strength:0;
--nw-logo-filter:none;
--nw-depth-sm:0 1px 2px rgba(60,40,20,.06);
--nw-depth-md:0 1px 2px rgba(60,40,20,.04),0 18px 40px -22px rgba(60,40,20,.16);
--nw-depth-lg:0 2px 4px rgba(60,40,20,.04),0 40px 80px -34px rgba(60,40,20,.22);
--nw-grad-lit:var(--nw-iridescent-sweep-deep);
--nw-sp:.45;
--nw-surface-page-base:radial-gradient(60% 50% at 6% 0%,color-mix(in oklab,var(--nw-flare-300) 26%,transparent),transparent 70%),radial-gradient(50% 50% at 98% 14%,color-mix(in oklab,var(--nw-halo-300) 24%,transparent),transparent 70%),radial-gradient(55% 50% at 70% 100%,color-mix(in oklab,var(--nw-swell-300) 18%,transparent),transparent 70%),var(--nw-ink-900);
}`;

/** The Detail type pairing, kept as a Look (Bricolage Grotesque, Lora, DM Mono). */
export const NEW_WORLD_DETAIL_CSS = `
[data-house-theme="new-world"][data-pairing="detail"]{
--nw-font-display:var(--font-nwd-bricolage,'Bricolage Grotesque'),'Helvetica Neue',Arial,sans-serif;
--nw-font-accent:var(--font-nwd-lora,'Lora'),Georgia,serif;
--nw-font-body:var(--font-nwd-bricolage,'Bricolage Grotesque'),'Helvetica Neue',Arial,sans-serif;
--nw-font-mono:var(--font-nwd-mono,'DM Mono'),ui-monospace,Menlo,monospace;
--nw-stretch-display:80%;
--nw-lh-display:0.9;
--nw-ls-display:-0.02em;
--nw-fw-display:800;
--nw-fw-bold:700;
--nw-fw-heavy:800;
--nw-lh-body:1.6;
--nw-em-size:1.04em;
}`;

/** The flat token set the Spaces, mail and previews wear for New World: the Night register, the Tide accent, ink on filled accent
 *  buttons. A Space's own picked accent still wins over `accent`. Literal hex, because a mail client reads no variable. */
export const NEW_WORLD_SURFACE = {
  canvas: "#0A0E16",
  raised: "#111826",
  elevated: "#1A2233",
  border: "rgba(242,245,250,.16)",
  text: "#F2F5FA",
  muted: "#C9D3E0",
  subtle: "#98A6BC",
  solid: "#1AA7C0",
  // A solid Tide band carries body copy, not a button label, so it keeps ink (6.9:1); white is for the filled buttons.
  onSolid: NEW_WORLD_INK_ON_ACCENT,
  dark: true,
  accent: {
    accent: "#1AA7C0",
    text: "#3FC1D6",
    on: NEW_WORLD_ON_ACCENT,
    bg: "#0C5F70",
  },
  semantic: { success: "#7CC97F", info: "#3FC1D6", danger: "#FF6A5B" },
} as const satisfies ThemeSurface;

/** The Space's --color-primary* family on a New World website (Night). No accent, or Tide itself: the measured Tide. Any other hex:
 *  that hex, a lighter text shade, and a label (ink or white) that reads on it. */
export function newWorldAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null;
  const t = NEW_WORLD_ACCENTS.tide;
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === t.accent) {
    return {
      "--color-primary": t.accent,
      "--color-primary-hover": t.text,
      "--color-primary-strong": t.text,
      "--color-primary-bg": t.soft,
      "--color-text-on-primary": NEW_WORLD_ON_ACCENT,
    };
  }
  return {
    "--color-primary": accent,
    "--color-primary-hover": `color-mix(in srgb, ${accent} 80%, white)`,
    "--color-primary-strong": `color-mix(in srgb, ${accent} 70%, white)`,
    "--color-primary-bg": `color-mix(in srgb, ${accent} 22%, ${NEW_WORLD_SURFACE.canvas})`,
    "--color-text-on-primary": contrastRatio(NEW_WORLD_ON_ACCENT, accent) >= 2 ? NEW_WORLD_ON_ACCENT : NEW_WORLD_INK_ON_ACCENT,
  };
}
