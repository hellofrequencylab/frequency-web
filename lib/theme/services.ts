import { HEX_ACCENT, contrastRatio, type AccentVars } from "@/lib/spaces/accent";
import type { ThemeSurface } from "@/lib/theme/surface-vars";
// THE SERVICES THEME (code id `services`, editor theme `Services`), built from the Services design system
// (docs/design-systems/services). PURE. Night is the default register; Day (`data-th="day"`) is the salt-and-cream
// light register. Six accent presets change only the flare, swell and halo ramps. The raw ramps are --sv-* so they
// never meet another theme's; the engine's own names (--th-*) come from the theme contract (themes.Services).
//
// Scope: these tokens live under [data-house-theme="services"] and are only ever emitted by the stand-alone site
// render. A site theme never styles a member, Space console or admin area (ADR-1906).

/** The owner accent presets that ship now (Tide, Signal, Bloom, Ember, Fern, Iris). Id to the steps the site engine reads. */
export const SERVICES_ACCENTS = {
  tide: {
    label: "Tide",
    accent: "#1AA7C0",
    hover: "#12879E",
    text: "#3FC1D6",
    soft: "#0C5F70",
    deep: "#8EDBE8",
    glow2: "#2BB3A6",
    glow3: "#40AAFF",
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
  signal: {
    label: "Signal",
    accent: "#2F7CF6",
    hover: "#1F60CC",
    text: "#6AA2FF",
    soft: "#164593",
    deep: "#A9C8FF",
    glow2: "#22B8D6",
    glow3: "#8B7BFF",
  },
  bloom: {
    label: "Bloom",
    accent: "#F05A73",
    hover: "#CC3F58",
    text: "#FF8398",
    soft: "#8F2A3C",
    deep: "#FFB8C3",
    glow2: "#FF9466",
    glow3: "#B57CFF",
  },
  iris: {
    label: "Iris",
    accent: "#7C6CF2",
    hover: "#5E4FD1",
    text: "#A193FF",
    soft: "#3F3494",
    deep: "#C9C1FF",
    glow2: "#3CC6D8",
    glow3: "#E879F9",
  },
} as const;

export type ServicesAccentId = keyof typeof SERVICES_ACCENTS;

/** Filled accent buttons carry ink, never white: ink on every preset is at least 4.5:1 (the handoff's contrast rule). */
export const SERVICES_ON_ACCENT = "#0B0F13";

/** The design system's token block, Night first. Compared value for value by the intake (scripts/design-system.test.ts). */
export const SERVICES_TOKENS_CSS = `
[data-house-theme="services"]{
--sv-ink-950:#06080A;--sv-ink-900:#0B0F13;--sv-ink-850:#10161B;--sv-ink-800:#161D24;--sv-ink-700:#222B34;--sv-ink-600:#333E49;--sv-graphite-400:#8C96A0;
--sv-chrome-50:#F5F6F7;--sv-chrome-200:#D3D9DE;--sv-chrome-400:#A3ACB4;
--sv-salt-50:#F6F1E9;--sv-salt-100:#ECE4D7;--sv-salt-300:#D4C6AF;--sv-salt-700:#5E574C;
--sv-flare-300:#8EDBE8;--sv-flare-400:#3FC1D6;--sv-flare-500:#1AA7C0;--sv-flare-600:#12879E;--sv-flare-700:#0C5F70;
--sv-swell-300:#8FE0D6;--sv-swell-500:#2BB3A6;--sv-swell-700:#11706A;
--sv-halo-300:#8CC8FF;--sv-halo-500:#40AAFF;
--sv-success-500:#4CC38A;--sv-warning-500:#F2B456;--sv-danger-500:#FF5A5F;
--sv-surface-page:var(--sv-ink-900);--sv-surface-sunken:var(--sv-ink-950);--sv-surface-raised:var(--sv-ink-850);--sv-surface-card:var(--sv-ink-800);
--sv-surface-light:var(--sv-salt-50);--sv-surface-light-sunken:var(--sv-salt-100);
--sv-text-primary:var(--sv-chrome-50);--sv-text-secondary:var(--sv-chrome-200);--sv-text-muted:var(--sv-graphite-400);--sv-text-accent:var(--sv-flare-500);
--sv-text-on-light:var(--sv-ink-900);--sv-text-on-light-muted:var(--sv-salt-700);
--sv-border-subtle:color-mix(in oklab,var(--sv-chrome-50) 8%,transparent);--sv-border-default:color-mix(in oklab,var(--sv-chrome-50) 16%,transparent);--sv-border-strong:color-mix(in oklab,var(--sv-chrome-50) 50%,transparent);--sv-border-light:color-mix(in oklab,var(--sv-ink-900) 12%,transparent);
--sv-accent:var(--sv-flare-500);--sv-accent-hover:var(--sv-flare-600);--sv-accent-text:#0B0F13;--sv-accent-tint:color-mix(in oklab,var(--sv-flare-500) 12%,transparent);
--sv-grad-lit:linear-gradient(100deg,var(--sv-halo-300) 0%,var(--sv-chrome-50) 30%,var(--sv-swell-300) 55%,var(--sv-flare-400) 78%,var(--sv-halo-300) 100%);
--sv-action-primary:var(--sv-chrome-50);--sv-action-primary-text:var(--sv-ink-900);
--sv-focus-ring:var(--sv-flare-400);
--sv-grad-sunset:linear-gradient(115deg,var(--sv-flare-500) 0%,var(--sv-swell-300) 100%);
--sv-sheen:linear-gradient(180deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 38%);
--sv-glow-sunset:linear-gradient(to top left,color-mix(in oklab,var(--sv-flare-500) 34%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 19%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 7%,var(--sv-ink-900)) 48%,transparent 72%);
--sv-spread-tr:linear-gradient(to bottom left,color-mix(in oklab,var(--sv-flare-500) 28%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 15%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 6%,var(--sv-ink-900)) 48%,transparent 72%);
--sv-spread-tl:linear-gradient(to bottom right,color-mix(in oklab,var(--sv-flare-500) 22%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 12%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 4%,var(--sv-ink-900)) 48%,transparent 72%);
--sv-spread-br:linear-gradient(to top left,color-mix(in oklab,var(--sv-halo-500) 20%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-halo-500) 11%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-halo-500) 4%,var(--sv-ink-900)) 48%,transparent 72%);
--sv-spread-bl:linear-gradient(to top right,color-mix(in oklab,var(--sv-swell-500) 18%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-swell-500) 10%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-swell-500) 4%,var(--sv-ink-900)) 48%,transparent 72%);
--sv-spread-bottom:linear-gradient(to top,color-mix(in oklab,var(--sv-flare-500) 30%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 12%,var(--sv-ink-900)) 30%,transparent 62%);
--sv-spread-top:linear-gradient(to bottom,color-mix(in oklab,var(--sv-flare-500) 14%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 5%,var(--sv-ink-900)) 28%,transparent 58%);
--sv-overlay-scrim:linear-gradient(90deg,color-mix(in oklab,var(--sv-ink-950) 90%,transparent) 0%,color-mix(in oklab,var(--sv-ink-950) 60%,transparent) 45%,color-mix(in oklab,var(--sv-ink-950) 20%,transparent) 100%);
--sv-overlay-bottom:linear-gradient(180deg,color-mix(in oklab,var(--sv-ink-950) 0%,transparent) 35%,color-mix(in oklab,var(--sv-ink-950) 95%,transparent) 100%);
--sv-space-1:4px;--sv-space-2:8px;--sv-space-3:12px;--sv-space-4:16px;--sv-space-5:24px;--sv-space-6:32px;--sv-space-7:48px;--sv-space-8:64px;--sv-space-9:96px;--sv-space-10:144px;
--sv-container-max:1320px;
--sv-gutter:clamp(20px,4vw,56px);
--sv-radius-none:0;--sv-radius-sm:6px;--sv-radius-md:12px;--sv-radius-lg:20px;--sv-radius-xl:28px;--sv-radius-pill:999px;
--sv-border-hairline:1px;
--sv-shadow-sm:0 1px 0 rgba(255,255,255,.06) inset,0 1px 2px rgba(0,0,0,.4);
--sv-shadow-md:0 1px 0 rgba(255,255,255,.08) inset,0 18px 40px -16px rgba(0,0,0,.7);
--sv-shadow-lg:0 1px 0 rgba(255,255,255,.1) inset,0 40px 80px -24px rgba(0,0,0,.8);
--sv-shadow-glow:0 10px 40px -10px color-mix(in oklab,var(--sv-flare-500) 55%,transparent);
--sv-ease-out:cubic-bezier(.16,1,.3,1);
--sv-ease-tide:cubic-bezier(.65,0,.35,1);
--sv-dur-fast:150ms;
--sv-dur-base:300ms;
--sv-dur-slow:800ms;
--sv-font-display:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;
--sv-font-accent:'Lora',Georgia,serif;
--sv-font-body:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;
--sv-font-mono:'DM Mono',ui-monospace,Menlo,monospace;
--sv-stretch-display:80%;
--sv-fs-display-xl:120px;--sv-fs-display-l:80px;--sv-fs-display-m:56px;--sv-fs-h1:44px;--sv-fs-h2:32px;--sv-fs-h3:22px;--sv-fs-h4:18px;
--sv-fs-body-l:18px;--sv-fs-body:16px;--sv-fs-body-s:14px;--sv-fs-caption:13px;--sv-fs-mono:11px;
--sv-lh-display:0.9;
--sv-lh-snug:1.15;
--sv-lh-body:1.6;
--sv-ls-display:-0.02em;
--sv-ls-mono:0.14em;
--sv-ls-button:0.1em;
--sv-fw-regular:400;
--sv-fw-medium:500;
--sv-fw-bold:700;
--sv-fw-heavy:800;
}
`;

/** The Day register: flips the ink and chrome scales so every surface follows. Kept apart so the intake compares Night alone. */
export const SERVICES_DAY_CSS = `
[data-house-theme="services"][data-th="day"]{
--sv-glow-sunset:linear-gradient(to top left,color-mix(in oklab,var(--sv-flare-500) 18%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 10%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 4%,var(--sv-ink-900)) 48%,transparent 72%);--sv-spread-tr:linear-gradient(to bottom left,color-mix(in oklab,var(--sv-flare-500) 14%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 8%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 3%,var(--sv-ink-900)) 48%,transparent 72%);--sv-spread-tl:linear-gradient(to bottom right,color-mix(in oklab,var(--sv-flare-500) 10%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 6%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-flare-500) 2%,var(--sv-ink-900)) 48%,transparent 72%);--sv-spread-br:linear-gradient(to top left,color-mix(in oklab,var(--sv-halo-500) 10%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-halo-500) 6%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-halo-500) 2%,var(--sv-ink-900)) 48%,transparent 72%);--sv-spread-bl:linear-gradient(to top right,color-mix(in oklab,var(--sv-swell-500) 9%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-swell-500) 5%,var(--sv-ink-900)) 22%,color-mix(in oklab,var(--sv-swell-500) 2%,var(--sv-ink-900)) 48%,transparent 72%);--sv-spread-bottom:linear-gradient(to top,color-mix(in oklab,var(--sv-flare-500) 16%,var(--sv-ink-900)) 0%,color-mix(in oklab,var(--sv-flare-500) 6%,var(--sv-ink-900)) 30%,transparent 62%);--sv-spread-top:linear-gradient(to bottom,color-mix(in oklab,var(--sv-flare-500) 8%,var(--sv-ink-900)) 0%,transparent 55%);--sv-ink-950:#ECE6DC;--sv-ink-900:#F5F1EA;--sv-ink-850:#FFFFFF;--sv-ink-800:#FBF9F5;--sv-ink-700:#E2DACD;--sv-ink-600:#CBC1B2;--sv-graphite-400:#6A645B;--sv-chrome-50:#15181C;--sv-chrome-200:#3A3F46;--sv-chrome-400:#5B6168;--sv-sheen:linear-gradient(180deg,rgba(255,255,255,.8) 0%,rgba(255,255,255,0) 38%);--sv-border-subtle:color-mix(in oklab,var(--sv-chrome-50) 10%,transparent);--sv-border-default:color-mix(in oklab,var(--sv-chrome-50) 18%,transparent);--sv-grad-lit:linear-gradient(100deg,var(--sv-flare-600) 0%,var(--sv-chrome-50) 30%,var(--sv-flare-500) 55%,var(--sv-halo-500) 78%,var(--sv-flare-600) 100%);--sv-shadow-sm:0 1px 2px rgba(60,40,20,.06);--sv-shadow-md:0 1px 2px rgba(60,40,20,.05),0 18px 40px -20px rgba(60,40,20,.22);--sv-shadow-lg:0 2px 4px rgba(60,40,20,.05),0 40px 80px -30px rgba(60,40,20,.3);color-scheme:light
}
`;

/** The flat token set the Spaces, mail and previews wear for Services: the Night register, the Tide accent, ink on filled accent
 *  buttons. A Space's own picked accent still wins over `accent`. Literal hex, because a mail client reads no variable. */
export const SERVICES_SURFACE = {
  canvas: "#0B0F13",
  raised: "#10161B",
  elevated: "#161D24",
  border: "rgba(245,246,247,.16)",
  text: "#F5F6F7",
  muted: "#D3D9DE",
  subtle: "#A3ACB4",
  solid: "#1AA7C0",
  onSolid: SERVICES_ON_ACCENT,
  dark: true,
  accent: {
    accent: "#1AA7C0",
    text: "#3FC1D6",
    on: SERVICES_ON_ACCENT,
    bg: "#0C5F70",
  },
  semantic: { success: "#4CC38A", info: "#3FC1D6", danger: "#FF5A5F" },
} as const satisfies ThemeSurface;

/** The Space's --color-primary* family on a Services website (Night). No accent, or Tide itself: the measured Tide. Any other hex:
 *  that hex, a lighter text shade, and a label (ink or white) that reads on it. */
export function servicesAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null;
  const t = SERVICES_ACCENTS.tide;
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === t.accent) {
    return {
      "--color-primary": t.accent,
      "--color-primary-hover": t.text,
      "--color-primary-strong": t.text,
      "--color-primary-bg": t.soft,
      "--color-text-on-primary": SERVICES_ON_ACCENT,
    };
  }
  return {
    "--color-primary": accent,
    "--color-primary-hover": `color-mix(in srgb, ${accent} 80%, white)`,
    "--color-primary-strong": `color-mix(in srgb, ${accent} 70%, white)`,
    "--color-primary-bg": `color-mix(in srgb, ${accent} 22%, ${SERVICES_SURFACE.canvas})`,
    "--color-text-on-primary": contrastRatio(SERVICES_ON_ACCENT, accent) >= 4.5 ? SERVICES_ON_ACCENT : "#FFFFFF",
  };
}
