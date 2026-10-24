// FREQUENCY TOKENS for React Native: a port, not a redesign.
//
// Source of truth: the LIVE Frequency theme the website wears (`<html data-design="frequency">`):
// app/themes/frequency.css, the alias layer, over app/themes/frequency/core.css, the token export,
// with the members kit (kit-members.css, members-ui.css). Where the alias layer overrides the export
// (canvas, accent, the pastel, muted text, status hues) the alias layer wins, because that is what a
// member sees. The app is the member room: Commons by day, the Commons night room (Thermal) when the
// phone is in dark mode, as the web does under `.dark`.
//
// Rules carried over from the system (design_handoff/frequency/README.md):
//   - the pastel (`pa`) is for the one primary action, progress and live dots only;
//   - Unbounded is for display, numbers and labels, at weight 500, never bold;
//   - no hex outside this file. Components read `useTheme()`.
// When the theme changes, change the VALUES here; a component never learns a new colour.

export type ColorScheme = 'light' | 'dark'

export type Palette = {
  canvas: string
  sunken: string
  card: string
  raised: string
  textStrong: string
  text: string
  textMuted: string
  textFaint: string
  border: string
  borderStrong: string
  /** `--fq-track`: meters and the segmented control's box. */
  track: string
  /** Ink at 4%: the input and segmented-track fill. */
  fill: string
  /** The primary action when it is not the pastel: ink on canvas (`.ink`, filled icon buttons). */
  ink: string
  onInk: string
  accent: string
  accentSoft: string
  accent2: string
  live: string
  liveSoft: string
  presence: string
  presenceSoft: string
  focus: string
  /** The pastel (`--fq-pa`): gradient stops, the ink that sits on it, and its glow. */
  pa: readonly [string, string, string]
  paSoft: readonly [string, string, string]
  onPa: string
  paGlow: string
  paRim: string
  switchThumb: string
  /** Physical white centre of the device RGB wheel, independent of room theme. */
  colorWheelNeutral: string
  /** The glass panel (`--fq-glass-panel`): gradient stops and its inset rim. */
  glass: readonly [string, string]
  glassRim: string
  /** Background wash: soft radial orbs [colour, opacity]. */
  wash: readonly (readonly [string, number])[]
  /** `.tag` base fill. */
  tagBg: string
  tipBg: string
  onTip: string
  scrim: string
  success: string
  warning: string
  danger: string
  info: string
  onStatus: string
}

/** Commons, as the alias layer resolves it (frequency.css :root[data-design="frequency"]). */
const commons: Palette = {
  canvas: '#F4F6F7',
  sunken: '#E9EEF1',
  card: '#FFFEFC',
  raised: '#FFFFFF',
  textStrong: '#34312E',
  text: '#4D4945',
  textMuted: '#6E6862',
  textFaint: '#6F6961',
  border: 'rgba(30,27,24,0.07)',
  borderStrong: 'rgba(30,27,24,0.2)',
  track: 'rgba(30,27,24,0.06)',
  fill: 'rgba(30,27,24,0.04)',
  ink: '#34312E',
  onInk: '#F4F6F7',
  accent: '#3A8C99',
  accentSoft: '#E4F3F4',
  accent2: '#17788A',
  live: '#B0287F',
  liveSoft: '#FBE3F1',
  presence: '#156D7E',
  presenceSoft: '#DDF3F5',
  focus: '#34312E',
  pa: ['#A3D4FF', '#8FE9FF', '#A3E8D4'],
  paSoft: ['rgba(163,212,255,0.24)', 'rgba(143,233,255,0.2)', 'rgba(163,232,212,0.2)'],
  onPa: '#34312E',
  paGlow: 'rgba(120,150,225,0.55)',
  paRim: 'rgba(255,255,255,0.5)',
  switchThumb: '#FFFFFF',
  colorWheelNeutral: '#FFFFFF',
  glass: ['rgba(255,252,246,0.7)', 'rgba(255,248,238,0.34)'],
  glassRim: 'rgba(255,255,255,0.8)',
  wash: [
    ['#A3D4FF', 0.26],
    ['#8FE9FF', 0.24],
    ['#A3E8D4', 0.18],
  ],
  tagBg: 'rgba(255,255,255,0.7)',
  tipBg: 'rgba(52,49,46,0.92)',
  onTip: '#F4F6F7',
  scrim: 'rgba(7,11,20,0.6)',
  success: '#296E4E',
  warning: '#895700',
  danger: '#B23227',
  info: '#2C6886',
  onStatus: '#FFFFFF',
}

/** The Commons night room (`.dark`): Thermal grounds, lifted hues. */
const commonsNight: Palette = {
  canvas: '#0E0B09',
  sunken: '#090706',
  card: '#18120E',
  raised: '#221A14',
  textStrong: '#FBF2E6',
  text: '#E3D6C6',
  textMuted: '#B3A391',
  textFaint: '#908170',
  border: 'rgba(251,242,230,0.09)',
  borderStrong: 'rgba(251,242,230,0.2)',
  track: 'rgba(251,242,230,0.08)',
  fill: 'rgba(251,242,230,0.05)',
  ink: '#FBF2E6',
  onInk: '#0E0B09',
  accent: '#3DF2FF',
  accentSoft: 'rgba(61,242,255,0.14)',
  accent2: '#5FD9E6',
  live: '#FF6FD8',
  liveSoft: 'rgba(255,111,216,0.14)',
  presence: '#5FD9E6',
  presenceSoft: 'rgba(95,217,230,0.12)',
  focus: '#FBF2E6',
  pa: ['#A3D4FF', '#8FE9FF', '#A3E8D4'],
  paSoft: ['rgba(163,212,255,0.14)', 'rgba(143,233,255,0.12)', 'rgba(163,232,212,0.12)'],
  onPa: '#1E1B18',
  paGlow: 'rgba(163,212,255,0.35)',
  paRim: 'rgba(255,255,255,0.5)',
  switchThumb: '#FFFFFF',
  colorWheelNeutral: '#FFFFFF',
  glass: ['rgba(34,26,20,0.7)', 'rgba(34,26,20,0.45)'],
  glassRim: 'rgba(251,242,230,0.08)',
  wash: [
    ['#A3D4FF', 0.1],
    ['#5FD9E6', 0.08],
  ],
  tagBg: 'rgba(34,26,20,0.75)',
  tipBg: 'rgba(251,242,230,0.94)',
  onTip: '#0E0B09',
  scrim: 'rgba(7,11,20,0.6)',
  success: '#3FA374',
  warning: '#C98200',
  danger: '#DC685F',
  info: '#3E94BE',
  onStatus: '#120C08',
}

export const palettes: Record<ColorScheme, Palette> = { light: commons, dark: commonsNight }

/** `--space-1` … `--space-13` (space-motion.css). Index by step, e.g. space[5] = 16. */
export const space = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88, 120] as const

/** Phone gutter, `--gutter-mobile`. */
export const gutter = 18

/** `--radius-s|m|l|xl|orb`. Roles: input = m, card and panel = l, sheet = 28, chip and button = orb. */
export const radius = { s: 10, m: 16, l: 24, sheet: 28, xl: 36, orb: 999 } as const

/** `--hit-min` / `--tap-min`: the smallest tap target. */
export const hitMin = 44

/** `--dur-fast|base|slow` in ms; 0 under reduced motion (see src/ui/motion.ts). */
export const duration = { fast: 160, base: 260, slow: 480 } as const

/** Easing curves (space-motion.css) as cubic-bezier control points. */
export const easing = {
  out: [0.16, 1, 0.3, 1],
  breath: [0.45, 0, 0.55, 1],
  drop: [0.7, 0, 0.3, 1],
} as const

/** The three faces, as loaded font family names (src/theme/fonts.ts). Unbounded only at 500. */
export const fonts = {
  display: 'Unbounded_500Medium',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const

/** The member type scale (members-ui.css / kit-members.css), phone sizes. */
export const type = {
  /** Page title. */
  h1: { fontSize: 28, lineHeight: 32, letterSpacing: -1.1 },
  /** `.h2` section title: Unbounded 500 22/1.1, -.035em. */
  h2: { fontSize: 22, lineHeight: 24, letterSpacing: -0.77 },
  /** `.h3` card title: Unbounded 500 17/1.2, -.025em. */
  h3: { fontSize: 17, lineHeight: 20, letterSpacing: -0.43 },
  body: { fontSize: 16, lineHeight: 25 },
  /** Buttons and inputs: Hanken 15. */
  control: { fontSize: 15, lineHeight: 18 },
  bodyS: { fontSize: 14, lineHeight: 20 },
  /** `.t2` / `.meta`: 13/1.35. */
  meta: { fontSize: 13, lineHeight: 18 },
  /** `.k` label: Unbounded 500 11px, tracked .14em, uppercase. */
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 1.54 },
  serif: { fontSize: 26, lineHeight: 30 },
} as const

/** `--shadow-1|2|float` as React Native shadows (boxShadow strings, RN 0.76+ with the new arch). */
export const shadow = {
  switchThumb: '0px 1px 3px rgba(30,27,24,0.25)',
  1: '0px 1px 2px rgba(30,27,24,0.06), 0px 4px 14px -6px rgba(30,27,24,0.12)',
  2: '0px 2px 6px rgba(30,27,24,0.06), 0px 18px 40px -18px rgba(30,27,24,0.28)',
  float: '0px 30px 80px -30px rgba(30,27,24,0.45)',
  /** `.card`. */
  card: '0px 1px 2px rgba(60,40,20,0.04), 0px 22px 50px -36px rgba(80,50,20,0.34)',
  /** `.panel` (day). */
  panel: '0px 1px 2px rgba(60,40,20,0.04), 0px 24px 50px -36px rgba(80,50,20,0.32)',
  panelNight: '0px 20px 50px -30px rgba(0,0,0,0.6)',
} as const
