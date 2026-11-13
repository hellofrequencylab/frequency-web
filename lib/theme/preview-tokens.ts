// THE PREVIEW TOKENS (the --pv-* contract) of the Create a Space live preview. PURE.
//
// SpacePreview reads only these custom properties, so one component dresses a Space's website and Spotlight
// in any Mega Theme. Colors come from the theme's own flat token set (MEGA_SURFACES, the one place every
// theme's palette is read); the type, corner and shadow treatment is a SHAPE table kept beside it, because no
// theme module exports it as one record. preview-tokens.test.ts fails when a MEGA_THEMES id is missing a key.
//
// The Frequency default has no surface entry (the house look IS the default), so its colors are written here
// from the cool canvas of app/themes/frequency.css.

import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import { SITE_THEMES } from '@/lib/theme/site-style'
import type { ThemeSurface } from '@/lib/theme/surface-vars'

/** Every key SpacePreview may read from the theme. The runtime accent trio is added by `previewAccentVars`. */
export const PREVIEW_TOKEN_KEYS = [
  '--pv-bg', '--pv-ink', '--pv-muted', '--pv-card', '--pv-line', '--pv-chrome',
  '--pv-font-display', '--pv-font-body', '--pv-display-weight', '--pv-display-case', '--pv-display-track', '--pv-label-track',
  '--pv-radius-btn', '--pv-radius-card', '--pv-radius-inner', '--pv-radius-photo',
  '--pv-mat', '--pv-shadow', '--pv-rule-w', '--pv-ring-opacity', '--pv-btn-bg', '--pv-btn-ink', '--pv-em-ink',
  '--pv-font-em', '--pv-art', '--pv-badge', '--pv-photo-ink', '--pv-photo-shade', '--pv-font-mono',
] as const
type PreviewTokenKey = (typeof PREVIEW_TOKEN_KEYS)[number]
type PreviewTokens = Record<PreviewTokenKey, string>

/** The kit order on the page. Designer first, and the default. */
/** The page's order once every kit is offered. A kit still hidden from the pickers (RETIRED_FROM_PICKERS in
 *  lib/theme/site-style.ts, the one hidden flag) is left out here too, so New World and Services reach the builder the
 *  moment that flag lets them go and never before. */
const PREVIEW_KIT_PREFERENCE: readonly MegaThemeId[] = [
  'new-world', 'services', 'free-human', 'cyberwitch', 'designer', 'midnight', 'network-kit', 'temple-kit', 'bold', 'wildheart', 'frequency',
]
export const PREVIEW_KIT_ORDER: readonly MegaThemeId[] = PREVIEW_KIT_PREFERENCE.filter((id) => SITE_THEMES.some((t) => t.id === id))

/** The faces the seven kits wear in the preview. The page asks Google Fonts for them only when it renders (the CSP
 *  allows it), the way the Space page does for a themed Space (lib/theme/site-faces.ts), so they register on no
 *  other route. Unbounded, Hanken Grotesk and Instrument Serif are the site's own. */
export const PREVIEW_FONT_SHEET =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Bodoni+Moda:wght@400;600&family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Cormorant:ital,wght@0,400;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=EB+Garamond:ital,wght@0,400;1,400&family=Geist:wght@300..600&family=IM+Fell+English:ital@0;1&family=Instrument+Serif:ital@1&family=Jost:wght@300..500&family=Lora:ital@1&family=Marcellus&family=Outfit:wght@300..500&family=Permanent+Marker&family=Sofia+Sans+Extra+Condensed:wght@800&family=Spectral:ital,wght@0,400;0,600;1,400&family=UnifrakturCook:wght@700&display=swap'

interface Shape {
  display: string; body: string; weight: string; textCase: string; track: string; label: string
  btn: string; card: string; inner: string; photo: string
  mat: string; shadow: (line: string) => string; rule: string; ring: string
  /** A fixed primary button; undefined means the button wears the chosen accent. */
  button?: { bg: string; ink: string }
  em?: string
  /** The face of the emphasised words (the kit's "one-word voice"); undefined means the display face. */
  emFont?: string
  /** Background art behind the website (the Network kit's contour lines); undefined means none. */
  art?: (line: string) => string
  /** A round accent badge beside the wordmark (the Network kit's mark). */
  badge?: boolean
}

const hairline = (line: string) => `inset 0 0 0 1px ${line}`

const SHAPE: Record<MegaThemeId, Shape> = {
  // New World (lib/theme/new-world.ts): Bricolage display and body, Lora italic for the one-word voice, the kit's 20px
  // cards and pill buttons, on the Night register. Services (lib/theme/services.ts) shares the type system and the radii.
  'new-world': {
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Bricolage Grotesque', system-ui, sans-serif",
    weight: '700', textCase: 'none', track: '-0.03em', label: '.08em',
    btn: '999px', card: '20px', inner: '12px', photo: '20px', mat: '0', shadow: hairline, rule: '0', ring: '0',
    emFont: "'Lora', Georgia, serif",
  },
  // CyberWitch (lib/theme/cyberwitch.ts): blackletter display, Spectral body, the sprayed Permanent Marker phrase, square plates on iron.
  cyberwitch: {
    display: "'UnifrakturCook', 'Old English Text MT', serif", body: "'Spectral', Georgia, serif",
    weight: '700', textCase: 'none', track: '0', label: '.14em',
    btn: '5px', card: '5px', inner: '3px', photo: '5px', mat: '0', shadow: hairline, rule: '0', ring: '0',
    emFont: "'Permanent Marker', 'Marker Felt', cursive",
  },
  services: {
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Bricolage Grotesque', system-ui, sans-serif",
    weight: '700', textCase: 'none', track: '-0.03em', label: '.08em',
    btn: '999px', card: '20px', inner: '12px', photo: '20px', mat: '0', shadow: hairline, rule: '0', ring: '0',
    emFont: "'Lora', Georgia, serif",
  },
  // Free Human (lib/theme/free-human.ts): Cormorant Garamond display with the clay on the emphasised word, Hanken Grotesk
  // body, wide labels, the kit's 16px controls, 40px cards, the arch on its pictures and its depth-2 shadow.
  'free-human': {
    display: "'Cormorant Garamond', Georgia, serif", body: "'Hanken Grotesk', system-ui, sans-serif",
    weight: '600', textCase: 'none', track: '-0.01em', label: '.2em',
    btn: '16px', card: '40px', inner: '16px', photo: '999px 999px 120px 120px', mat: '0',
    shadow: () => '0 2px 4px -2px rgba(90,30,12,.10),0 12px 24px -14px rgba(90,30,12,.22),0 34px 64px -34px rgba(120,50,20,.30)', rule: '0', ring: '0',
    em: '#B3361F', // token-ok: Free Human clay 500 (--text-lyric), lib/theme/free-human.ts
  },
  designer: {
    display: "'Cormorant', 'Cormorant Garamond', Georgia, serif", body: "'Jost', system-ui, sans-serif",
    weight: '400', textCase: 'none', track: '-0.01em', label: '.18em',
    btn: '8px', card: '1.8cqi', inner: '1.1cqi', photo: '999px 999px 0 0', mat: '.9cqi',
    shadow: () => '0 1px 2px rgba(90,69,51,.08),0 12px 28px -14px rgba(90,69,51,.3)', rule: '4cqi', ring: '1',
    em: '#5A4533', // token-ok: Designer walnut, lib/theme/designer.ts
  },
  midnight: {
    display: "'Bodoni Moda', Georgia, serif", body: "'Geist', system-ui, sans-serif",
    weight: '600', textCase: 'none', track: '-0.01em', label: '.08em',
    btn: '2px', card: '2px', inner: '2px', photo: '2px', mat: '0', shadow: hairline, rule: '0', ring: '0',
  },
  // The Network kit (lib/theme/network-kit.ts): Bricolage display, Outfit body, Instrument Serif italic for the one-word
  // voice, a round accent mark beside the wordmark, the arched hero picture and the contour lines of its hero.
  'network-kit': {
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Outfit', system-ui, sans-serif",
    weight: '700', textCase: 'none', track: '-0.035em', label: '0',
    btn: '999px', card: '14px', inner: '14px', photo: '18px 34% 18px 18px', mat: '0', shadow: hairline, rule: '0', ring: '0',
    emFont: "'Instrument Serif', Georgia, serif",
    art: (line) => `repeating-radial-gradient(ellipse 140% 70% at 0% 100%, transparent 0 5.6cqi, ${line} 5.6cqi calc(5.6cqi + 1px))`,
    badge: true,
  },
  network: {
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Outfit', system-ui, sans-serif",
    weight: '700', textCase: 'none', track: '-0.03em', label: '.08em',
    btn: '999px', card: '14px', inner: '14px', photo: '18px', mat: '0', shadow: hairline, rule: '0', ring: '0',
  },
  temple: {
    display: "'Marcellus', Georgia, serif", body: "'Hanken Grotesk', system-ui, sans-serif",
    weight: '400', textCase: 'none', track: '0', label: '.08em',
    btn: '999px', card: '10px', inner: '10px', photo: '999px 999px 12px 12px', mat: '0', shadow: hairline, rule: '0', ring: '0',
  },
  // The Temple kit (lib/theme/temple-kit.ts): Marcellus display, Jost body, wide labels, the arched picture, the clay
  // on the emphasised word (--display-em-color), the kit's soft depth shadow in place of a hairline.
  'temple-kit': {
    display: "'Marcellus', Georgia, serif", body: "'Jost', system-ui, sans-serif",
    weight: '400', textCase: 'none', track: '-0.015em', label: '.18em',
    btn: '10px', card: '16px', inner: '10px', photo: '50% 50% 6px 6px / 42% 42% 6px 6px', mat: '0',
    shadow: () => '0 2px 6px rgba(74,53,39,.07)', rule: '0', ring: '0',
    em: '#9C4A2C', // token-ok: Temple kit clay 600, lib/theme/temple-kit.ts
  },
  // Bold (lib/theme/menswork.ts, design system docs/design-systems/bold): Sofia Sans Extra Condensed caps at 800,
  // Barlow body, mono-width label tracking and the design's square corners everywhere.
  // The Create a Space handoff (docs/design-systems/create-a-space) drew Bold as 'Anton', Impact, sans-serif before the
  // Bold design system (LIVE-2101) replaced it; the newer system wins here (LIVE-2173).
  bold: {
    display: "'Sofia Sans Extra Condensed', 'Arial Narrow', sans-serif", body: "'Barlow', system-ui, sans-serif",
    weight: '800', textCase: 'uppercase', track: '0.005em', label: '.12em',
    btn: '0', card: '0', inner: '0', photo: '0', mat: '0', shadow: hairline, rule: '0', ring: '0',
  },
  // Wildheart (lib/theme/wildheart.ts, the revised design system): IM Fell English display, EB Garamond body, the
  // petal card and control corners, the arch on its pictures and its soft shadow.
  wildheart: {
    display: "'IM Fell English', Georgia, serif", body: "'EB Garamond', Garamond, Georgia, serif",
    weight: '400', textCase: 'none', track: '-0.005em', label: '.16em',
    btn: '999px', card: '24px 24px 6px 24px', inner: '14px 14px 4px 14px', photo: '999px 999px 24px 24px', mat: '0',
    shadow: () => '0 1px 2px rgba(58,46,41,.04),0 8px 28px rgba(58,46,41,.06)', rule: '0', ring: '0', // token-ok: Wildheart --shadow-soft
  },
  frequency: {
    display: "'Unbounded', system-ui, sans-serif", body: "'Hanken Grotesk', system-ui, sans-serif",
    weight: '600', textCase: 'none', track: '-0.03em', label: '.08em',
    btn: '999px', card: '16px', inner: '16px', photo: '16px', mat: '0', shadow: hairline, rule: '0', ring: '0',
  },
}

/** The house default: cool canvas, pastel-pill white card (app/themes/frequency.css). */
const FREQUENCY_SURFACE: ThemeSurface = {
  dark: false, canvas: '#F4F6F7', raised: '#FFFFFF', elevated: '#E9EEF1', border: 'rgba(30,27,24,.08)', // token-ok: Frequency default ground
  text: '#34312E', muted: '#6E6862', subtle: '#6E6862', solid: '#34312E', onSolid: '#F4F6F7', // token-ok: Frequency ink set
  accent: { accent: '#3A8C99', text: '#2B6B75', on: '#FFFFFF', bg: '#E3F0F2' }, // token-ok: Sea glass, the default accent
  semantic: { success: '#3C8C7C', info: '#4F8FC0', danger: '#B3402F' }, // token-ok: Frequency notes
}

/** A theme's flat surface; Network (classic) reads the Network kit's until it has a preview of its own. */
function surfaceOf(id: MegaThemeId): ThemeSurface {
  return MEGA_SURFACES[id] ?? (id === 'frequency' ? FREQUENCY_SURFACE : (MEGA_SURFACES['network-kit'] as ThemeSurface))
}

/** The --pv-* tokens of one theme, generated from its own palette and the SHAPE table. */
export function previewTokens(id: MegaThemeId): PreviewTokens {
  const s = surfaceOf(id)
  const p = SHAPE[id]
  return {
    '--pv-bg': s.canvas,
    '--pv-ink': s.text,
    '--pv-muted': s.muted,
    '--pv-card': s.raised,
    '--pv-line': s.border,
    '--pv-chrome': s.dark ? s.raised : s.elevated,
    '--pv-font-display': p.display,
    '--pv-font-body': p.body,
    '--pv-display-weight': p.weight,
    '--pv-display-case': p.textCase,
    '--pv-display-track': p.track,
    '--pv-label-track': p.label,
    '--pv-radius-btn': p.btn,
    '--pv-radius-card': p.card,
    '--pv-radius-inner': p.inner,
    '--pv-radius-photo': p.photo,
    '--pv-mat': p.mat,
    '--pv-shadow': p.shadow(s.border),
    '--pv-rule-w': p.rule,
    '--pv-ring-opacity': p.ring,
    '--pv-btn-bg': p.button?.bg ?? (id === 'designer' ? s.solid : 'var(--pv-accent)'),
    '--pv-btn-ink': p.button?.ink ?? (id === 'designer' ? s.onSolid : 'var(--pv-on-accent)'),
    '--pv-em-ink': p.em ?? 'var(--pv-accent-ink)',
    '--pv-font-em': p.emFont ?? p.display,
    '--pv-art': p.art ? p.art(s.border) : 'none',
    '--pv-badge': p.badge ? 'inline-flex' : 'none',
    // Over a picture the words are light and the scrim is dark, whatever the theme's ground is (the photo-hero themes).
    '--pv-photo-ink': '#FFFFFF', // token-ok: text over a photograph
    '--pv-photo-shade': '#000000', // token-ok: the scrim under that text
    '--pv-font-mono': "ui-monospace, 'SFMono-Regular', Menlo, monospace", // Services and Bold's mono voice
  }
}

/** The label on an accent fill: ink above .42 relative luminance, white below (the handoff's rule). */
export function previewOnAccent(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.42 ? '#111111' : '#FFFFFF' // token-ok: label on a runtime accent fill
}

/** The runtime accent trio for a chosen fill. `text` is the 4.5:1 step on light grounds; dark grounds use the fill. */
export function previewAccentVars(fill: string, text: string | null, dark: boolean): Record<string, string> {
  return {
    '--pv-accent': fill,
    '--pv-accent-ink': dark || !text ? fill : text,
    '--pv-on-accent': previewOnAccent(fill),
  }
}

/** The accents a theme offers in the picker: its own family first, then the house set. */
export function previewDefaultAccent(id: MegaThemeId): { fill: string; text: string | null; dark: boolean } {
  const s = surfaceOf(id)
  return { fill: s.accent.accent, text: s.dark ? null : s.accent.text, dark: s.dark }
}
