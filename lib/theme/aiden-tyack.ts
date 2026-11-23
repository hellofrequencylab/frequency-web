import { HEX_ACCENT, contrastRatio, type AccentVars } from "@/lib/spaces/accent";
import type { ThemeSurface } from "@/lib/theme/surface-vars";
// THE AIDEN TYACK THEME (code id `aiden-tyack`, editor theme `AidenTyack`). PRIVATE: drawn for aidentyack.com and offered only to the
// Space it was drawn for (PRIVATE_THEME_SITES in lib/theme/site-style.ts). Built from the Claude Design handoff "Aiden Tyack Design
// System" (theme.css + tokens.json, owner 2026-11-22). PURE.
//
// The feel, in the design's words: workshop leather under redwood shade, stitched by hand, built to outlast you. Bone canvas, chalk
// surfaces, ink text, a walnut accent and pine bands. Grenze Gotisch 700 for headings in Title Case (never all caps, never under 28px),
// Archivo for body, buttons and labels, Cormorant Garamond italic for one aside per section. The signature is the stitch: a 1.5px dashed
// line inside buttons, cards and photos. Corners are nearly square, shadows are warm, grain sits on every surface.
//
// DAY FIRST with a Night register (`data-th="night"`): a deep pine canvas, bone text and a buckskin accent with ink labels; bands flip to
// bone. Tokens are --at-* so they never meet another theme's.
//
// Scope: these tokens live under [data-house-theme="aiden-tyack"] and are only ever emitted by the stand-alone site render. A site theme
// never styles a member, Space console or admin area (ADR-1906).

/** The five accent families (tokens.json `accents`), each for both registers. Walnut is the main one. */
export const AIDEN_TYACK_ACCENTS = {
  walnut: { label: "Walnut", day: { accent: "#582F0E", hover: "#7F4F24", soft: "#A68A64", bg: "#EFE6D6", deep: "#3E2008", text: "#7F4F24", on: "#F7F4EC" }, night: { accent: "#C2A57C", hover: "#D6C09C", soft: "#7F4F24", bg: "#3A3424", deep: "#ECE8DA", text: "#C9AC82", on: "#1B1F15" } },
  saddle: { label: "Saddle", day: { accent: "#7F4F24", hover: "#6A3F1A", soft: "#C9A97E", bg: "#F1E7D8", deep: "#4A2A0E", text: "#7F4F24", on: "#F7F4EC" }, night: { accent: "#D0B088", hover: "#E0C8A6", soft: "#7F4F24", bg: "#3B3424", deep: "#F2E6D2", text: "#D0B088", on: "#1B1F15" } },
  forest: { label: "Forest", day: { accent: "#414833", hover: "#333D29", soft: "#A4AC86", bg: "#E4E6D6", deep: "#262E1F", text: "#414833", on: "#ECE8DA" }, night: { accent: "#A4AC86", hover: "#B9C09C", soft: "#565D3E", bg: "#323A28", deep: "#E4E6D6", text: "#B5BC95", on: "#1B1F15" } },
  moss: { label: "Moss", day: { accent: "#5A6240", hover: "#4B5236", soft: "#A4AC86", bg: "#E6E8D8", deep: "#333D29", text: "#4E5637", on: "#F7F4EC" }, night: { accent: "#B5BC95", hover: "#C7CDAA", soft: "#656D4A", bg: "#343C29", deep: "#E6E8D8", text: "#B5BC95", on: "#1B1F15" } },
  oxblood: { label: "Oxblood", day: { accent: "#7A2A1A", hover: "#5E1F12", soft: "#C98E7E", bg: "#F2E2DC", deep: "#4A170D", text: "#7A2A1A", on: "#F7F4EC" }, night: { accent: "#D98C78", hover: "#E6A897", soft: "#7A2A1A", bg: "#3A2A22", deep: "#F2E2DC", text: "#E09A86", on: "#1B1F15" } },
} as const;

type AidenTyackAccentId = keyof typeof AIDEN_TYACK_ACCENTS;

const S = '[data-house-theme="aiden-tyack"]';
const NIGHT = '[data-house-theme="aiden-tyack"][data-th="night"]';

/** The design's token block (theme.css). Day is the root; the Night block follows. Names are the design's, prefixed `--at-`. */
export const AIDEN_TYACK_TOKENS_CSS = `
${S}{
--at-canvas:#ECE8DA;
--at-surface:#F7F4EC;
--at-raised:#FBF9F4;
--at-sunken:#DDD8C4;
--at-text:#1B1F15;
--at-text-muted:#414833;
--at-text-subtle:#565D3E;
--at-line:#D0C9B1;
--at-line-strong:#7E7760;
--at-success:#4B5530;
--at-warning:#8A5A12;
--at-danger:#8C2F1B;
--at-info:#414833;
--at-focus:#936639;
--at-band:#333D29;
--at-on-band:#ECE8DA;
--at-band-accent-text:#C9AC82;
--at-stitch:#B6AD90;
--at-accent:#582F0E;
--at-accent-hover:#7F4F24;
--at-accent-soft:#A68A64;
--at-accent-bg:#EFE6D6;
--at-accent-deep:#3E2008;
--at-accent-text:#7F4F24;
--at-on-accent:#F7F4EC;
--at-photo-text:#F7F4EC;
--at-photo-muted:#DDD8C4;
--at-photo-accent:#D6C09C;
--at-photo-shade:#1B1F15;
--at-shadow-card:0 1px 0 rgba(255,252,244,.55) inset,0 1px 1px rgba(58,32,10,.08),0 2px 6px -2px rgba(58,32,10,.14);
--at-shadow-lift:0 1px 0 rgba(255,252,244,.55) inset,0 2px 3px rgba(58,32,10,.10),0 12px 22px -10px rgba(58,32,10,.32),0 28px 48px -28px rgba(58,32,10,.35);
--at-r-control:2px;
--at-r-card:2px;
--at-r-panel:3px;
--at-r-media:2px;
--at-frame:1.5px dashed;
--at-font-display:var(--font-at-display,'Grenze Gotisch'),'UnifrakturCook',serif;
--at-font-body:var(--font-at-body,'Archivo'),'Helvetica Neue',sans-serif;
--at-font-voice:var(--font-at-voice,'Cormorant Garamond'),Garamond,serif;
--at-lead-display:.95;
--at-section-y:clamp(64px,9vw,128px);
--at-gap:clamp(24px,3vw,40px);
--at-gutter:clamp(20px,4vw,48px);
--at-measure:62ch;
--at-dur-fast:120ms;
--at-dur:220ms;
--at-ease:cubic-bezier(.2,.7,.2,1);
--at-grain:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .24  0 0 0 0 .15  0 0 0 0 .06  0 0 0 .7 -.25'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='.14'/></svg>");
--at-grain-hide:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='h'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .96  0 0 0 0 .88  0 0 0 .8 -.4'/></filter><rect width='100%25' height='100%25' filter='url(%23h)' opacity='.14'/></svg>");
}
${NIGHT}{
--at-canvas:#262E1F;
--at-surface:#333D29;
--at-raised:#414833;
--at-sunken:#1D2418;
--at-text:#ECE8DA;
--at-text-muted:#C2C5AA;
--at-text-subtle:#A4AC86;
--at-line:#46503A;
--at-line-strong:#8A9172;
--at-success:#B5BC95;
--at-warning:#D9A55B;
--at-danger:#E8957E;
--at-info:#C2C5AA;
--at-focus:#C2A57C;
--at-band:#ECE8DA;
--at-on-band:#1B1F15;
--at-band-accent-text:#7F4F24;
--at-stitch:#6E7656;
--at-accent:#C2A57C;
--at-accent-hover:#D6C09C;
--at-accent-soft:#7F4F24;
--at-accent-bg:#3A3424;
--at-accent-deep:#ECE8DA;
--at-accent-text:#C9AC82;
--at-on-accent:#1B1F15;
--at-shadow-card:0 1px 0 rgba(255,246,228,.06) inset,0 2px 6px -2px rgba(0,0,0,.45);
--at-shadow-lift:0 1px 0 rgba(255,246,228,.08) inset,0 12px 22px -10px rgba(0,0,0,.55),0 28px 48px -28px rgba(0,0,0,.6);
}`;

/** The spacing and corner dials. Square is the design's own (2px / 3px); soft and subtle round it a little more. */
export const AIDEN_TYACK_DIALS_CSS = `
${S}[data-site-corners="soft"]{--at-r-control:6px;--at-r-card:8px;--at-r-panel:10px;--at-r-media:8px}
${S}[data-site-corners="subtle"]{--at-r-control:4px;--at-r-card:4px;--at-r-panel:6px;--at-r-media:4px}
${S}[data-site-spacing="balanced"]{--at-section-y:clamp(52px,7vw,96px)}
${S}[data-site-spacing="compact"]{--at-section-y:clamp(40px,5vw,68px);--at-gutter:clamp(16px,3vw,32px)}
`;

/** The five families as `data-scheme` blocks: the site root names the family the owner's accent is (aidenTyackScheme), so each register
 *  wears that family's own measured values. Walnut is the root's own, so it needs no block. Any other colour is `custom`: Day wears the
 *  owner's hex through --color-primary*, Night keeps Walnut's buckskin (a hand-picked day colour has no measured night pair). */
export const AIDEN_TYACK_ACCENT_CSS = (Object.keys(AIDEN_TYACK_ACCENTS) as AidenTyackAccentId[])
  .map((id) => {
    const { day: d, night: n } = AIDEN_TYACK_ACCENTS[id];
    return `${S}[data-scheme="${id}"]{--at-accent:${d.accent};--at-accent-hover:${d.hover};--at-accent-soft:${d.soft};--at-accent-bg:${d.bg};--at-accent-deep:${d.deep};--at-accent-text:${d.text};--at-on-accent:${d.on}}
${NIGHT}[data-scheme="${id}"]{--at-accent:${n.accent};--at-accent-hover:${n.hover};--at-accent-soft:${n.soft};--at-accent-bg:${n.bg};--at-accent-deep:${n.deep};--at-accent-text:${n.text};--at-on-accent:${n.on}}`;
  })
  .join("\n") + `
${S}[data-scheme="custom"]:not([data-th="night"]){--at-accent:var(--color-primary);--at-accent-hover:var(--color-primary-hover);--at-accent-text:var(--color-primary-strong);--at-accent-bg:var(--color-primary-bg);--at-on-accent:var(--color-text-on-primary)}`;

/** The data-scheme a website root carries for the owner's accent: its family, Walnut when none is set, `custom` for any other hex. */
export function aidenTyackScheme(brandAccent: string | null | undefined): AidenTyackAccentId | "custom" {
  const accent = brandAccent?.trim() || null;
  if (!accent || !HEX_ACCENT.test(accent)) return "walnut";
  return aidenTyackAccentId(accent) ?? "custom";
}

/** The flat token set mail and previews wear for Aiden Tyack (Day, Walnut). Literal hex, because a mail client reads no variable. */
export const AIDEN_TYACK_SURFACE = {
  canvas: "#ECE8DA",
  raised: "#F7F4EC",
  elevated: "#FBF9F4",
  border: "#D0C9B1",
  text: "#1B1F15",
  muted: "#414833",
  subtle: "#565D3E",
  solid: "#582F0E",
  onSolid: "#F7F4EC",
  dark: false,
  accent: { accent: "#582F0E", text: "#7F4F24", on: "#F7F4EC", bg: "#EFE6D6" },
  semantic: { success: "#4B5530", info: "#414833", danger: "#8C2F1B" },
} as const satisfies ThemeSurface;

/** The family a colour is (matched on either register's fill), or null for any other colour. */
export function aidenTyackAccentId(hex: string | null | undefined): AidenTyackAccentId | null {
  const want = hex?.trim().toUpperCase();
  if (!want) return null;
  return (Object.keys(AIDEN_TYACK_ACCENTS) as AidenTyackAccentId[]).find((id) => AIDEN_TYACK_ACCENTS[id].day.accent.toUpperCase() === want || AIDEN_TYACK_ACCENTS[id].night.accent.toUpperCase() === want) ?? null;
}

/** The Space's --color-primary* family on an Aiden Tyack website (Day values; the Night register re-points the skin's own tokens). No
 *  accent, or a family: that family's measured ramp. Any other hex: that hex, a deeper text shade, and a label (bone or ink) that reads. */
export function aidenTyackAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null;
  const family = accent && HEX_ACCENT.test(accent) ? aidenTyackAccentId(accent) : null;
  if (!accent || !HEX_ACCENT.test(accent) || family) {
    const p = AIDEN_TYACK_ACCENTS[family ?? "walnut"].day;
    return {
      "--color-primary": p.accent,
      "--color-primary-hover": p.hover,
      "--color-primary-strong": p.text,
      "--color-primary-bg": p.bg,
      "--color-text-on-primary": p.on,
    };
  }
  const bone = AIDEN_TYACK_SURFACE.raised;
  const ink = AIDEN_TYACK_SURFACE.text;
  return {
    "--color-primary": accent,
    "--color-primary-hover": `color-mix(in srgb, ${accent} 80%, black)`,
    "--color-primary-strong": `color-mix(in srgb, ${accent} 80%, black)`,
    "--color-primary-bg": `color-mix(in srgb, ${accent} 10%, ${AIDEN_TYACK_SURFACE.canvas})`,
    "--color-text-on-primary": contrastRatio(bone, accent) >= 4.5 ? bone : ink,
  };
}
