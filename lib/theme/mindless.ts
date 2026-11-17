import { HEX_ACCENT, contrastRatio, type AccentVars } from "@/lib/spaces/accent";
import type { ThemeSurface } from "@/lib/theme/surface-vars";
// THE MINDLESS THEME (code id `mindless`, editor theme `Mindless`), built from the Mindless design system (docs/design-systems/mindless,
// the Claude Design "Mindless" Design System artifact). PURE. A meditation brand for loud lives: warm ink grounds, bone type, one paint
// accent (yellow to start) and a small offset paint per section. Rubik Wet Paint for the drip display, Archivo for everything else.
// NIGHT FIRST with a Day register (`data-th="day"`): bone-pink paper, ink type, and yellow is never text on a light ground (the accent
// phrase sits on a yellow highlighter instead). Tokens are --ml-* so they never meet another theme's; the engine's own names (--th-*)
// come from the theme contract (themes.Mindless).
//
// Colour system (the design's 60 / 30 / 10): 60 warm ink grounds (ground, raised, raised-2, pit), never pure black; 30 bone type plus one
// muted violet band; 10 the accent (logo, primary actions, one key phrase per headline); under 3 the offset paint on one to three small
// details. One card style: raised surface and a 1px hairline. Extrusion only at display sizes. In a set, the first item is featured in
// the accent and the rest go bone.
//
// Scope: these tokens live under [data-house-theme="mindless"] and are only ever emitted by the stand-alone site render.
// A site theme never styles a member, Space console or admin area (ADR-1906).
//
// Deliberate differences from the design system, recorded in docs/design-systems/mindless/rules.json:
//  - Pieces NFI (the logotype face) does not ship as a web font: its licence is unverified. The wordmark is the design's own SVG.
//  - Motion is fixed off (the design ships still); prefers-reduced-motion is honoured regardless.

/** The owner accent presets (Yellow, Pink, Blue). `noise1`/`noise2` are the two offset paints for that accent; `day` is the Day
 *  register's text step (yellow becomes ink, pink and blue darken to read on paper). Yellow is the starting accent. */
export const MINDLESS_ACCENTS = {
  yellow: { label: "Yellow", meaning: "The paint", accent: "#ECBC19", hover: "#F3CB3C", text: "#ECBC19", soft: "#A3832B", deep: "#A3832B", dayText: "#231B1D", noise1: "#E6297D", noise1Text: "#F0609F", noise1Day: "#B0185D", noise2: "#3D85C7", noise2Text: "#6AA6DC", noise2Day: "#245B95" },
  pink: { label: "Pink", meaning: "The loud one", accent: "#E6297D", hover: "#EE4F95", text: "#F0609F", soft: "#9C305D", deep: "#9C305D", dayText: "#B0185D", noise1: "#ECBC19", noise1Text: "#ECBC19", noise1Day: "#231B1D", noise2: "#3D85C7", noise2Text: "#6AA6DC", noise2Day: "#245B95" },
  blue: { label: "Blue", meaning: "The cool one", accent: "#3D85C7", hover: "#5A9AD4", text: "#6AA6DC", soft: "#3D75B3", deep: "#3D75B3", dayText: "#245B95", noise1: "#ECBC19", noise1Text: "#ECBC19", noise1Day: "#231B1D", noise2: "#E6297D", noise2Text: "#F0609F", noise2Day: "#B0185D" },
} as const;

export type MindlessAccentId = keyof typeof MINDLESS_ACCENTS;

/** Filled accent buttons carry ink, never white (the design's --th-on-accent). Bold 19px+ labels on Pink and Blue. */
export const MINDLESS_ON_ACCENT = "#231B1D";

/** The design system's token block (tokens.json + components/bundle.css). Night is the root; the Day block follows. Names are the
 *  design's, prefixed `--ml-`. */
export const MINDLESS_TOKENS_CSS = `
[data-house-theme="mindless"]{
--ml-pit:#120C0E;
--ml-ground:#231B1D;
--ml-raised:#2E2529;
--ml-raised-2:#372D32;
--ml-band-pit:#191215;
--ml-violet:#28243A;
--ml-violet-raised:#34304A;
--ml-line:rgba(236,228,230,.09);
--ml-line-strong:rgba(236,228,230,.22);
--ml-head:#ECE4E6;
--ml-body:#D6CBCF;
--ml-secondary:#C4B6BA;
--ml-muted:#A99DA2;
--ml-bone:#DCCFD2;
--ml-light-head:#ECE4E6;
--ml-paper:#F1E8EA;
--ml-paper-muted:#D6CBCF;
--ml-ink:#231B1D;
--ml-yellow:#ECBC19;
--ml-pink:#E6297D;
--ml-blue:#3D85C7;
--ml-accent:#ECBC19;
--ml-accent-hover:#F3CB3C;
--ml-accent-text:#ECBC19;
--ml-accent-soft:#A3832B;
--ml-accent-tint:color-mix(in oklab,var(--ml-accent) 12%,transparent);
--ml-on-accent:#231B1D;
--ml-noise-1:#E6297D;
--ml-noise-1-text:#F0609F;
--ml-noise-2:#3D85C7;
--ml-noise-2-text:#6AA6DC;
--ml-success:#4FD394;
--ml-warning:#ECBC19;
--ml-danger:#FF5C6E;
--ml-font-display:var(--font-ml-paint,'Rubik Wet Paint'),Impact,'Arial Black',sans-serif;
--ml-font-body:var(--font-ml-archivo,'Archivo'),'Helvetica Neue',Arial,sans-serif;
--ml-fs-label:12px;
--ml-fs-small:14px;
--ml-fs-body:17px;
--ml-fs-lede:20px;
--ml-fs-h3:clamp(26px,3vw,34px);
--ml-fs-h2:clamp(40px,5.6vw,72px);
--ml-fs-h1:clamp(56px,9vw,128px);
--ml-lh-display:.98;
--ml-lh-body:1.6;
--ml-ls-label:.1em;
--ml-gutter:clamp(20px,4vw,48px);
--ml-container-max:1200px;
--ml-section-y:clamp(88px,10vw,140px);
--ml-corner:16px;
--ml-corner-sm:6px;
--ml-corner-lg:32px;
--ml-radius-pill:999px;
--ml-dur-fast:120ms;
--ml-dur-base:220ms;
--ml-ease-out:cubic-bezier(.2,.8,.2,1);
--ml-outline:3px solid var(--ml-pit);
--ml-depth-ink:1px 1px 0 var(--ml-pit),2px 2px 0 var(--ml-pit),3px 3px 0 var(--ml-pit),4px 4px 0 var(--ml-pit);
--ml-depth-ink-xl:1px 1px 0 var(--ml-pit),2px 2px 0 var(--ml-pit),3px 3px 0 var(--ml-pit),4px 4px 0 var(--ml-pit),5px 5px 0 var(--ml-pit),6px 6px 0 var(--ml-pit);
--ml-shadow-sticker:3px 4px 0 0 var(--ml-pit);
--ml-shadow-sticker-lift:5px 7px 0 0 var(--ml-pit);
--ml-shadow-card:0 0 0 1px var(--ml-line);
--ml-shadow-panel:0 24px 48px -24px rgba(18,12,14,.8);
--ml-tex-grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0 0.05  1.1 0 0 0 -0.56'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
--ml-tex-drip:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='80' viewBox='0 0 640 80'%3E%3Cpath d='M0 0 H640 V10.0 L640.0 10.0 L632.0 9.4 L624.0 8.5 L616.0 8.0 L608.0 8.2 L600.0 9.0 L592.0 10.4 L584.0 11.8 L576.0 12.7 L568.0 12.9 L560.0 12.6 L552.0 12.0 L544.0 11.6 L536.0 11.7 L528.0 12.4 L520.0 13.3 L512.0 14.1 L504.0 14.3 L496.0 13.7 L488.0 12.6 L480.0 11.2 L472.0 10.1 L464.0 9.6 L456.0 9.8 L448.0 10.3 L440.0 10.7 L432.0 10.7 L424.0 10.1 L416.0 9.0 L408.0 8.0 L400.0 7.5 L392.0 7.7 L384.0 8.6 L376.0 9.9 L368.0 11.1 L360.0 11.7 L352.0 11.7 L344.0 11.3 L336.0 10.9 L328.0 10.8 L320.0 11.3 L312.0 12.4 L304.0 13.6 L296.0 14.4 L288.0 14.6 L280.0 14.0 L272.0 12.8 L264.0 11.7 L256.0 10.9 L248.0 10.8 L240.0 11.1 L232.0 11.6 L224.0 11.8 L216.0 11.4 L208.0 10.4 L200.0 9.1 L192.0 8.0 L184.0 7.5 L176.0 7.7 L168.0 8.6 L160.0 9.7 L152.0 10.5 L144.0 10.8 L136.0 10.5 L128.0 10.0 L120.0 9.6 L112.0 9.9 L104.0 10.7 L96.0 12.0 L88.0 13.4 L80.0 14.2 L72.0 14.3 L64.0 13.7 L56.0 12.7 L48.0 11.9 L40.0 11.6 L32.0 11.8 L24.0 12.4 L16.0 12.9 L8.0 12.9 L0.0 12.2 Z'/%3E%3Cpath d='M3.6 2.0 C11.6 2.0 12.6 13.0 12.6 17.0 C12.6 29.3 15.2 30.4 15.2 34.8 A8.0 8.0 0 1 0 28.8 34.8 C28.8 30.4 31.4 29.3 31.4 8.0 C31.4 13.0 32.4 2.0 40.4 2.0 Z'/%3E%3Cpath d='M18.9 52.9 a3.1 3.1 0 1 0 6.1 0 a3.1 3.1 0 1 0 -6.1 0Z'/%3E%3Cpath d='M71.2 2.0 C79.2 2.0 80.2 13.0 80.2 17.0 C80.2 18.4 82.4 13.2 82.4 17.0 A6.8 6.8 0 1 0 93.9 17.0 C93.9 13.2 96.2 18.4 96.2 8.0 C96.2 13.0 97.2 2.0 105.2 2.0 Z'/%3E%3Cpath d='M177.5 2.0 C185.5 2.0 186.5 13.0 186.5 17.0 C186.5 41.5 188.8 51.5 188.8 55.4 A7.0 7.0 0 1 0 200.7 55.4 C200.7 51.5 203.0 41.5 203.0 8.0 C203.0 13.0 204.0 2.0 212.0 2.0 Z'/%3E%3Cpath d='M232.2 2.0 C240.2 2.0 241.2 13.0 241.2 17.0 C241.2 34.2 243.7 39.0 243.7 43.1 A7.5 7.5 0 1 0 256.4 43.1 C256.4 39.0 258.8 34.2 258.8 8.0 C258.8 13.0 259.8 2.0 267.8 2.0 Z'/%3E%3Cpath d='M247.1 59.5 a2.9 2.9 0 1 0 5.9 0 a2.9 2.9 0 1 0 -5.9 0Z'/%3E%3Cpath d='M294.0 2.0 C302.0 2.0 303.0 13.0 303.0 17.0 C303.0 18.2 306.0 10.6 306.0 15.8 A9.3 9.3 0 1 0 321.9 15.8 C321.9 10.6 324.9 18.2 324.9 8.0 C324.9 13.0 325.9 2.0 333.9 2.0 Z'/%3E%3Cpath d='M383.0 2.0 C391.0 2.0 392.0 13.0 392.0 17.0 C392.0 23.6 395.1 19.5 395.1 24.7 A9.5 9.5 0 1 0 411.3 24.7 C411.3 19.5 414.4 23.6 414.4 8.0 C414.4 13.0 415.4 2.0 423.4 2.0 Z'/%3E%3Cpath d='M474.6 2.0 C482.6 2.0 483.6 13.0 483.6 17.0 C483.6 16.6 486.5 8.5 486.5 13.3 A8.7 8.7 0 1 0 501.2 13.3 C501.2 8.5 504.1 16.6 504.1 8.0 C504.1 13.0 505.1 2.0 513.1 2.0 Z'/%3E%3Cpath d='M532.9 2.0 C540.9 2.0 541.9 13.0 541.9 17.0 C541.9 34.4 544.5 38.9 544.5 43.2 A7.9 7.9 0 1 0 557.9 43.2 C557.9 38.9 560.5 34.4 560.5 8.0 C560.5 13.0 561.5 2.0 569.5 2.0 Z'/%3E%3Cpath d='M592.0 2.0 C600.0 2.0 601.0 13.0 601.0 17.0 C601.0 19.4 603.8 13.4 603.8 18.1 A8.5 8.5 0 1 0 618.2 18.1 C618.2 13.4 621.0 19.4 621.0 8.0 C621.0 13.0 622.0 2.0 630.0 2.0 Z'/%3E%3C/svg%3E");
}
[data-house-theme="mindless"][data-th="day"]{
--ml-pit:#231B1D;
--ml-ground:#F1E8EA;
--ml-raised:#FBF7F8;
--ml-raised-2:#ECE4E6;
--ml-band-pit:#231B1D;
--ml-violet:#EBE6EF;
--ml-violet-raised:#F6F3F8;
--ml-line:rgba(35,27,29,.12);
--ml-line-strong:rgba(35,27,29,.28);
--ml-head:#231B1D;
--ml-body:#231B1D;
--ml-secondary:#43383D;
--ml-muted:#6B5E63;
--ml-accent-text:#231B1D;
--ml-noise-1-text:#B0185D;
--ml-noise-2-text:#245B95;
--ml-depth-ink:1px 1px 0 var(--ml-accent),2px 2px 0 var(--ml-accent),3px 3px 0 var(--ml-accent),4px 4px 0 var(--ml-pit);
--ml-depth-ink-xl:1px 1px 0 var(--ml-accent),2px 2px 0 var(--ml-accent),3px 3px 0 var(--ml-accent),4px 4px 0 var(--ml-accent),5px 5px 0 var(--ml-pit),6px 6px 0 var(--ml-pit);
--ml-shadow-panel:0 24px 48px -28px rgba(35,27,29,.35);
}`;

/** The spacing and corner dials, as the design's theme contract writes them. */
export const MINDLESS_DIALS_CSS = `
[data-house-theme="mindless"][data-site-corners="soft"]{--ml-corner:16px;--ml-corner-sm:6px;--ml-corner-lg:32px}
[data-house-theme="mindless"][data-site-corners="subtle"]{--ml-corner:8px;--ml-corner-sm:4px;--ml-corner-lg:14px}
[data-house-theme="mindless"][data-site-corners="square"]{--ml-corner:0px;--ml-corner-sm:0px;--ml-corner-lg:0px}
[data-house-theme="mindless"][data-site-spacing="airy"]{--ml-section-y:clamp(88px,10vw,140px)}
[data-house-theme="mindless"][data-site-spacing="balanced"]{--ml-section-y:clamp(64px,7.5vw,104px)}
[data-house-theme="mindless"][data-site-spacing="compact"]{--ml-section-y:clamp(44px,5vw,72px);--ml-gutter:clamp(16px,3vw,32px)}
`;

/** The three presets as `data-accent` blocks, so an editor preview or a Look can set one on a root. Each rewrites the accent and its
 *  two offset paints; the Day register re-points the text steps. */
export const MINDLESS_ACCENT_CSS = (Object.keys(MINDLESS_ACCENTS) as MindlessAccentId[])
  .map((id) => {
    const a = MINDLESS_ACCENTS[id];
    return `[data-house-theme="mindless"][data-accent="${id}"]{--ml-accent:${a.accent};--ml-accent-hover:${a.hover};--ml-accent-text:${a.text};--ml-accent-soft:${a.soft};--ml-noise-1:${a.noise1};--ml-noise-1-text:${a.noise1Text};--ml-noise-2:${a.noise2};--ml-noise-2-text:${a.noise2Text}}
[data-house-theme="mindless"][data-th="day"][data-accent="${id}"]{--ml-accent-text:${a.dayText};--ml-noise-1-text:${a.noise1Day};--ml-noise-2-text:${a.noise2Day}}`;
  })
  .join("\n");

/** The flat token set the Spaces, mail and previews wear for Mindless: warm ink and bone, the Yellow accent, ink on filled accent
 *  buttons. A Space's own picked accent still wins over `accent`. Literal hex, because a mail client reads no variable. */
export const MINDLESS_SURFACE = {
  canvas: "#231B1D",
  raised: "#2E2529",
  elevated: "#372D32",
  border: "rgba(236,228,230,.22)",
  text: "#ECE4E6",
  muted: "#D6CBCF",
  subtle: "#A99DA2",
  solid: "#ECBC19",
  onSolid: MINDLESS_ON_ACCENT,
  dark: true,
  accent: {
    accent: "#ECBC19",
    text: "#ECBC19",
    on: MINDLESS_ON_ACCENT,
    bg: "#A3832B",
  },
  semantic: { success: "#4FD394", info: "#6AA6DC", danger: "#FF5C6E" },
} as const satisfies ThemeSurface;

/** The Space's --color-primary* family on a Mindless website. No accent, or a preset: the preset's own measured ramp. Any other hex:
 *  that hex, a lighter text shade, and a label (ink or white) that reads on it. */
export function mindlessAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null;
  const preset = accent && HEX_ACCENT.test(accent) ? Object.values(MINDLESS_ACCENTS).find((a) => a.accent.toUpperCase() === accent.toUpperCase()) : undefined;
  if (!accent || !HEX_ACCENT.test(accent) || preset) {
    const p = preset ?? MINDLESS_ACCENTS.yellow;
    return {
      "--color-primary": p.accent,
      "--color-primary-hover": p.hover,
      "--color-primary-strong": p.text,
      "--color-primary-bg": `color-mix(in srgb, ${p.accent} 12%, ${MINDLESS_SURFACE.canvas})`,
      "--color-text-on-primary": MINDLESS_ON_ACCENT,
    };
  }
  return {
    "--color-primary": accent,
    "--color-primary-hover": `color-mix(in srgb, ${accent} 70%, white)`,
    "--color-primary-strong": `color-mix(in srgb, ${accent} 70%, white)`,
    "--color-primary-bg": `color-mix(in srgb, ${accent} 12%, ${MINDLESS_SURFACE.canvas})`,
    "--color-text-on-primary": contrastRatio(MINDLESS_ON_ACCENT, accent) >= 4.5 ? MINDLESS_ON_ACCENT : "#FFFFFF",
  };
}

/** The preset a colour is, or null for any other colour. */
export function mindlessAccentId(hex: string | null | undefined): MindlessAccentId | null {
  const want = hex?.trim().toUpperCase();
  if (!want) return null;
  return (Object.keys(MINDLESS_ACCENTS) as MindlessAccentId[]).find((id) => MINDLESS_ACCENTS[id].accent.toUpperCase() === want) ?? null;
}

const MINDLESS_ACCENT_PHOTO = /\/sites\/mindless\/photos\/(hero|guide)-(yellow|pink|blue)\.jpg/g;

/** The paint photos are treated once per accent (a duotone in the paint). Every one of those pictures in `value` (a site snapshot, any
 *  JSON) re-pointed to `accent`'s treatment, so a Space started in Pink opens on the pink hero, not the kit's default. PURE. */
export function withMindlessAccentPhotos<T>(value: T, accent: MindlessAccentId): T {
  return JSON.parse(JSON.stringify(value).replace(MINDLESS_ACCENT_PHOTO, (_m, kind: string) => `/sites/mindless/photos/${kind}-${accent}.jpg`)) as T;
}
