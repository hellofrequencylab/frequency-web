import { HEX_ACCENT, contrastRatio, type AccentVars } from "@/lib/spaces/accent";
import type { ThemeSurface } from "@/lib/theme/surface-vars";
// THE CYBERWITCH THEME (code id `cyberwitch`, editor theme `CyberWitch`), built from the CyberWitch design system
// (docs/design-systems/cyberwitch). PURE. Industrial street-punk witch: cold iron and bone underneath, a blackletter grimoire
// on top, one neon accent sprayed over everything. DARK ONLY: there is no Day register (the register dial is locked to night, so
// a `data-th="day"` write still resolves to the same ink). Tokens are --cw-* so they never meet another theme's; the engine's
// own names (--th-*) come from the theme contract (themes.CyberWitch).
//
// Scope: these tokens live under [data-house-theme="cyberwitch"] and are only ever emitted by the stand-alone site render.
// A site theme never styles a member, Space console or admin area (ADR-1906).
//
// Deliberate differences from the zip, recorded in docs/design-systems/cyberwitch/rules.json:
//  - Blood's fill is #F2184C, not the zip's #F0164A: ink on #F0164A reads 4.45:1 and a label must reach 4.5:1 (the design's own rule is 3:1).
//  - Five accents ship, not six: Volt is a violet, and the violet family is retired (ADR-1792, Daniel 2026-11-03).
//  - The zip's names (--ink-*, --flare-*, --accent ...) are prefixed --cw- so they sit beside other themes on one page.

/** The owner accent presets (Hex, Absinthe, Ice, Blood, Venom). Id to the steps the site engine reads. `clash` is the spray colour
 *  that fights the accent; it is only ever used for spray marks, never for text or fills. Hex is the starting accent. */
export const CYBERWITCH_ACCENTS = {
  hex: { label: "Hex", meaning: "The tag", accent: "#FF00FF", hover: "#FF8CF0", text: "#FF4DE6", soft: "#800080", deep: "#FF8CF0", c600: "#C400C4", clash: "#B4FF1A", clashSoft: "#DAFF8C" },
  absinthe: { label: "Absinthe", meaning: "Acid", accent: "#B4FF1A", hover: "#DAFF8C", text: "#C6FF4D", soft: "#4A6B00", deep: "#DAFF8C", c600: "#86C400", clash: "#FF00FF", clashSoft: "#FF8CFF" },
  ice: { label: "Ice", meaning: "Cold", accent: "#1FF4FF", hover: "#9CFFFF", text: "#5CFFFF", soft: "#005F66", deep: "#9CFFFF", c600: "#00A8B3", clash: "#FF2E8A", clashSoft: "#FF8CC0" },
  blood: { label: "Blood", meaning: "Crimson and candle", accent: "#F2184C", hover: "#FF9FB4", text: "#FF5C80", soft: "#6E001C", deep: "#FF9FB4", c600: "#B0002E", clash: "#FFC23D", clashSoft: "#FFE0A0" },
  venom: { label: "Venom", meaning: "Verdigris and poison", accent: "#19E3B1", hover: "#A6FFE8", text: "#5CF5D0", soft: "#00573F", deep: "#A6FFE8", c600: "#00A07A", clash: "#FF2BD6", clashSoft: "#FF9CF0" },
} as const;

export type CyberWitchAccentId = keyof typeof CYBERWITCH_ACCENTS;

/** Filled accent buttons carry ink, never white (the zip's --on-accent, --th-on-accent). */
export const CYBERWITCH_ON_ACCENT = "#0D1112";

/** The design system's token block. The plain scales come first (the intake compares them value for value); the Hex ramp is the
 *  root default and every preset rewrites only the flare and clash ramps. Names are the zip's, prefixed `--cw-`. */
export const CYBERWITCH_TOKENS_CSS = `
[data-house-theme="cyberwitch"]{
--cw-ink-950:#07090A;
--cw-ink-900:#0D1112;
--cw-ink-850:#141A1B;
--cw-ink-800:#1B2324;
--cw-ink-700:#263031;
--cw-chrome-50:#ECE8DF;
--cw-chrome-200:#BDB8AD;
--cw-chrome-muted:#868D89;
--cw-flare-300:#FF8CF0;
--cw-flare-400:#FF4DE6;
--cw-flare-500:#FF00FF;
--cw-flare-600:#C400C4;
--cw-flare-700:#800080;
--cw-clash-300:#DAFF8C;
--cw-clash-500:#B4FF1A;
--cw-surface-page:var(--cw-ink-900);
--cw-surface-sunken:var(--cw-ink-950);
--cw-surface-card:var(--cw-ink-850);
--cw-surface-raised:var(--cw-ink-800);
--cw-text-primary:var(--cw-chrome-50);
--cw-text-secondary:var(--cw-chrome-200);
--cw-text-muted:var(--cw-chrome-muted);
--cw-border-subtle:color-mix(in oklab,var(--cw-chrome-50) 10%,transparent);
--cw-border-default:color-mix(in oklab,var(--cw-chrome-50) 22%,transparent);
--cw-border-strong:color-mix(in oklab,var(--cw-chrome-50) 46%,transparent);
--cw-accent:var(--cw-flare-500);
--cw-accent-hover:var(--cw-flare-300);
--cw-accent-text:var(--cw-flare-400);
--cw-on-accent:#0D1112;
--cw-accent-tint:color-mix(in oklab,var(--cw-flare-500) 13%,transparent);
--cw-accent-line:color-mix(in oklab,var(--cw-flare-500) 60%,transparent);
--cw-spray:var(--cw-flare-500);
--cw-clash:var(--cw-clash-500);
--cw-success:#1AFF7A;
--cw-warning:#FFB01A;
--cw-danger:#FF2440;
--cw-font-gothic:var(--font-cw-gothic,'UnifrakturCook'),'Old English Text MT',serif;
--cw-font-scrawl:var(--font-cw-scrawl,'Permanent Marker'),'Marker Felt',cursive;
--cw-font-caps:var(--font-cw-spectral,'Spectral'),Georgia,serif;
--cw-font-body:var(--font-cw-spectral,'Spectral'),Georgia,serif;
--cw-fs-label:12px;
--cw-fs-small:14px;
--cw-fs-body:17px;
--cw-fs-lede:20px;
--cw-fs-h4:26px;
--cw-fs-h3:36px;
--cw-fs-h2:clamp(44px,6vw,84px);
--cw-fs-h1:clamp(64px,10vw,150px);
--cw-lh-display:.98;
--cw-lh-body:1.6;
--cw-ls-display:0;
--cw-ls-label:.14em;
--cw-space-1:4px;
--cw-space-2:8px;
--cw-space-3:12px;
--cw-space-4:16px;
--cw-space-5:20px;
--cw-space-6:24px;
--cw-space-8:32px;
--cw-space-10:40px;
--cw-space-12:48px;
--cw-space-16:64px;
--cw-space-20:80px;
--cw-space-24:96px;
--cw-gutter:clamp(20px,4vw,52px);
--cw-container-max:1260px;
--cw-container-narrow:760px;
--cw-plate-sm:5px;
--cw-plate-md:12px;
--cw-plate-lg:20px;
--cw-radius-pill:999px;
--cw-dur-fast:120ms;
--cw-dur-base:260ms;
--cw-dur-slow:520ms;
--cw-ease-out:cubic-bezier(.16,1,.3,1);
--cw-glow-sm:0 0 6px color-mix(in oklab,var(--cw-flare-500) 55%,transparent);
--cw-glow-md:0 0 0 1px color-mix(in oklab,var(--cw-flare-400) 80%,transparent),0 0 10px color-mix(in oklab,var(--cw-flare-500) 45%,transparent),0 0 34px color-mix(in oklab,var(--cw-flare-500) 20%,transparent);
--cw-glow-lg:0 0 60px color-mix(in oklab,var(--cw-flare-500) 30%,transparent),var(--cw-glow-md);
--cw-glow-text:0 0 1px var(--cw-flare-300),0 0 6px color-mix(in oklab,var(--cw-flare-500) 75%,transparent),0 0 20px color-mix(in oklab,var(--cw-flare-500) 38%,transparent),0 0 48px color-mix(in oklab,var(--cw-flare-500) 18%,transparent);
--cw-shadow-plate:inset 0 1px 0 color-mix(in oklab,var(--cw-chrome-50) 6%,transparent),inset 0 -24px 40px -28px rgba(0,0,0,.7),0 2px 0 rgba(0,0,0,.55),0 18px 32px -18px rgba(0,0,0,.8);
--cw-shadow-poster:0 1px 1px rgba(0,0,0,.6),0 10px 14px -6px rgba(0,0,0,.6),0 32px 48px -20px rgba(0,0,0,.85);
--cw-shadow-text:0 2px 0 rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.7);
--cw-frame:inset 0 0 0 2px var(--cw-border-strong),inset 0 0 0 8px var(--cw-ink-950),inset 0 0 0 9px var(--cw-border-default);
--cw-tex-grain:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='140' height='140' filter='url(%23g)'/></svg>");
--cw-tex-grime:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='.004 .007' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 -.25'/></filter><rect width='900' height='900' filter='url(%23c)'/></svg>");
--cw-tex-stone:linear-gradient(172deg,color-mix(in oklab,var(--cw-chrome-50) 4%,transparent),transparent 38%),linear-gradient(8deg,color-mix(in oklab,var(--cw-ink-950) 55%,transparent),transparent 45%);
--cw-tex-chain:repeating-linear-gradient(45deg,color-mix(in oklab,var(--cw-chrome-50) 7%,transparent) 0 1px,transparent 1px 26px),repeating-linear-gradient(-45deg,color-mix(in oklab,var(--cw-chrome-50) 7%,transparent) 0 1px,transparent 1px 26px);
--cw-tex-mist:radial-gradient(40% 55% at 78% 30%,color-mix(in oklab,var(--cw-flare-500) 22%,transparent),transparent 70%),radial-gradient(30% 40% at 12% 85%,color-mix(in oklab,var(--cw-clash-500) 12%,transparent),transparent 70%);
--cw-tex-iron:repeating-linear-gradient(90deg,color-mix(in oklab,var(--cw-chrome-50) 12%,transparent) 0 2px,transparent 2px 42px);
--cw-vignette:radial-gradient(120% 90% at 50% 40%,transparent 45%,color-mix(in oklab,var(--cw-ink-950) 85%,transparent) 100%);
--cw-haze-top:linear-gradient(180deg,color-mix(in oklab,var(--cw-flare-500) 14%,var(--cw-ink-900)) 0%,var(--cw-ink-900) 48%);
--cw-haze-bottom:linear-gradient(0deg,color-mix(in oklab,var(--cw-flare-500) 16%,var(--cw-ink-900)) 0%,var(--cw-ink-900) 52%);
--cw-haze-spray:linear-gradient(200deg,color-mix(in oklab,var(--cw-clash-500) 18%,var(--cw-ink-900)) 0%,var(--cw-ink-900) 40%);
--cw-section-y:clamp(88px,10vw,140px);
--cw-corner:12px;
--cw-corner-sm:5px;
--cw-corner-lg:20px;
}`;

/** The spacing and corner dials, as the zip's frequency.css writes them. CyberWitch is dark only, so there is no Day block. */
export const CYBERWITCH_DIALS_CSS = `
[data-house-theme="cyberwitch"][data-site-corners="soft"]{--cw-corner:12px;--cw-corner-sm:5px;--cw-corner-lg:20px}
[data-house-theme="cyberwitch"][data-site-corners="subtle"]{--cw-corner:6px;--cw-corner-sm:3px;--cw-corner-lg:9px}
[data-house-theme="cyberwitch"][data-site-corners="square"]{--cw-corner:0px;--cw-corner-sm:0px;--cw-corner-lg:0px}
[data-house-theme="cyberwitch"][data-site-spacing="airy"]{--cw-section-y:clamp(88px,10vw,140px)}
[data-house-theme="cyberwitch"][data-site-spacing="balanced"]{--cw-section-y:clamp(64px,7.5vw,104px)}
[data-house-theme="cyberwitch"][data-site-spacing="compact"]{--cw-section-y:clamp(44px,5vw,72px);--cw-gutter:clamp(16px,3vw,32px)}
`;

/** The five presets as `data-accent` blocks, so an editor preview or a Look can set one on a root. Each rewrites only the ramps. */
export const CYBERWITCH_ACCENT_CSS = (Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[])
  .map((id) => {
    const a = CYBERWITCH_ACCENTS[id];
    return `[data-house-theme="cyberwitch"][data-accent="${id}"]{--cw-flare-300:${a.hover};--cw-flare-400:${a.text};--cw-flare-500:${a.accent};--cw-flare-600:${a.c600};--cw-flare-700:${a.soft};--cw-clash-300:${a.clashSoft};--cw-clash-500:${a.clash}}`;
  })
  .join("\n");

/** The flat token set the Spaces, mail and previews wear for CyberWitch: iron and bone, the Hex accent, ink on filled accent
 *  buttons. A Space's own picked accent still wins over `accent`. Literal hex, because a mail client reads no variable. */
export const CYBERWITCH_SURFACE = {
  canvas: "#0D1112",
  raised: "#141A1B",
  elevated: "#1B2324",
  border: "rgba(236,232,223,.22)",
  text: "#ECE8DF",
  muted: "#BDB8AD",
  subtle: "#868D89",
  solid: "#FF00FF",
  onSolid: CYBERWITCH_ON_ACCENT,
  dark: true,
  accent: {
    accent: "#FF00FF",
    text: "#FF4DE6",
    on: CYBERWITCH_ON_ACCENT,
    bg: "#800080",
  },
  semantic: { success: "#1AFF7A", info: "#5CFFFF", danger: "#FF2440" },
} as const satisfies ThemeSurface;

/** The Space's --color-primary* family on a CyberWitch website. No accent, or a preset: the preset's own measured ramp. Any other hex:
 *  that hex, a lighter text shade, and a label (ink or white) that reads on it. Fill, text shade and glow all follow it. */
export function cyberwitchAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null;
  const preset = accent && HEX_ACCENT.test(accent) ? Object.values(CYBERWITCH_ACCENTS).find((a) => a.accent.toUpperCase() === accent.toUpperCase()) : undefined;
  if (!accent || !HEX_ACCENT.test(accent) || preset) {
    const p = preset ?? CYBERWITCH_ACCENTS.hex;
    return {
      "--color-primary": p.accent,
      "--color-primary-hover": p.hover,
      "--color-primary-strong": p.text,
      "--color-primary-bg": `color-mix(in srgb, ${p.accent} 13%, ${CYBERWITCH_SURFACE.canvas})`,
      "--color-text-on-primary": CYBERWITCH_ON_ACCENT,
    };
  }
  return {
    "--color-primary": accent,
    "--color-primary-hover": `color-mix(in srgb, ${accent} 60%, white)`,
    "--color-primary-strong": `color-mix(in srgb, ${accent} 70%, white)`,
    "--color-primary-bg": `color-mix(in srgb, ${accent} 13%, ${CYBERWITCH_SURFACE.canvas})`,
    "--color-text-on-primary": contrastRatio(CYBERWITCH_ON_ACCENT, accent) >= 4.5 ? CYBERWITCH_ON_ACCENT : "#FFFFFF",
  };
}

/** The preset a colour is, or null for any other colour. */
export function cyberwitchAccentId(hex: string | null | undefined): CyberWitchAccentId | null {
  const want = hex?.trim().toUpperCase();
  if (!want) return null;
  return (Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[]).find((id) => CYBERWITCH_ACCENTS[id].accent.toUpperCase() === want) ?? null;
}

const CYBERWITCH_ACCENT_PHOTO = /\/sites\/cyberwitch\/photos\/(hero|founder)-(hex|absinthe|ice|blood|venom)\.jpg/g;

/** The hero wall and the founder are shot once per neon. Every one of those pictures in `value` (a site snapshot, any JSON)
 *  re-pointed to `accent`'s shot, so a Space started in Absinthe opens on the green wall, not the kit's default. PURE. */
export function withCyberWitchAccentPhotos<T>(value: T, accent: CyberWitchAccentId): T {
  return JSON.parse(JSON.stringify(value).replace(CYBERWITCH_ACCENT_PHOTO, (_m, kind: string) => `/sites/cyberwitch/photos/${kind}-${accent}.jpg`)) as T;
}
