// FREQUENCY TOKENS for React Native: a port, not a redesign.
//
// Source of truth: design_handoff/frequency/tokens/ (themes.css, space-motion.css, typography.css),
// the same export app/themes/frequency/core.css is generated from. The app is the member room, so it
// wears COMMONS (light, the default) and dims to the Commons night room (Thermal) when the phone is in
// dark mode, exactly as the web does under `data-time="night"`. Stage (marketing, always dark) is not
// used here.
//
// Rules carried over from the system (design_handoff/frequency/README.md):
//   - the crossover hues mean one thing each: violet = act, magenta = live, aqua = presence, sun = reward;
//   - the pastel accent (`pa`) is for actions, progress and live dots only;
//   - no hex outside this file. Components read `useTheme()`.
// When the export changes, change the VALUES here; a component never learns a new colour.

export type ColorScheme = 'light' | 'dark'

/** Crossover hues, `--x-*` in themes.css. Neon on Stage, deep on Commons. */
export const crossover = {
  violetNeon: '#8B5CFF',
  violetDeep: '#5B3FD0',
  magentaNeon: '#FF2BD6',
  magentaDeep: '#B0287F',
  aquaNeon: '#3DF2FF',
  aquaDeep: '#17788A',
  sunNeon: '#FFC46B',
  sunDeep: '#9A6200',
} as const

export type Palette = {
  canvas: string
  sunken: string
  card: string
  raised: string
  glass: string
  textStrong: string
  text: string
  textMuted: string
  textFaint: string
  textOnAccent: string
  border: string
  borderStrong: string
  track: string
  action: string
  actionText: string
  actionHover: string
  accent: string
  accentSoft: string
  accent2: string
  live: string
  liveSoft: string
  presence: string
  presenceSoft: string
  reward: string
  rewardSoft: string
  focus: string
  link: string
  tipBg: string
  /** The pastel accent gradient stops (`--pa`), for progress and live dots only. */
  pa: readonly [string, string, string, string]
  /** Background wash (`--wash`): three soft radial orbs [colour, opacity]. */
  wash: readonly (readonly [string, number])[]
  success: string
  warning: string
  danger: string
  info: string
}

/** `:root,[data-theme="commons"]` */
const commons: Palette = {
  canvas: '#FAF4EA',
  sunken: '#F2E9DC',
  card: '#FFFEFC',
  raised: '#FFFFFF',
  glass: 'rgba(255,251,245,0.74)',
  textStrong: '#34312E',
  text: '#4D4945',
  textMuted: '#7C766F',
  textFaint: '#A59F98',
  textOnAccent: '#FFFFFF',
  border: 'rgba(30,27,24,0.07)',
  borderStrong: 'rgba(30,27,24,0.2)',
  track: 'rgba(30,27,24,0.06)',
  action: crossover.violetDeep,
  actionText: '#FFFFFF',
  actionHover: '#4A31B8',
  accent: crossover.violetDeep,
  accentSoft: '#ECE6FF',
  accent2: crossover.aquaDeep,
  live: crossover.magentaDeep,
  liveSoft: '#FBE3F1',
  presence: crossover.aquaDeep,
  presenceSoft: '#DDF3F5',
  reward: crossover.sunDeep,
  rewardSoft: '#FFF0D6',
  focus: crossover.violetDeep,
  link: crossover.violetDeep,
  tipBg: 'rgba(52,49,46,0.92)',
  pa: ['#EEC1EC', '#C4B8FF', '#A3D4FF', '#8FE9FF'],
  wash: [
    ['#D6BEFA', 0.24],
    ['#8FE9FF', 0.28],
    ['#B8A2FF', 0.18],
  ],
  // colors.css semantic status (day).
  success: '#2F7F5A',
  warning: '#A86A00',
  danger: '#C2362B',
  info: '#2F6F8F',
}

/** `[data-theme="commons"][data-time="night"]`: the Thermal room, crossover hues lifted. */
const commonsNight: Palette = {
  canvas: '#0E0B09',
  sunken: '#090706',
  card: '#18120E',
  raised: '#221A14',
  glass: 'rgba(34,26,20,0.7)',
  textStrong: '#FBF2E6',
  text: '#E3D6C6',
  textMuted: '#B3A391',
  textFaint: '#857767',
  textOnAccent: '#120C08',
  border: 'rgba(251,242,230,0.09)',
  borderStrong: 'rgba(251,242,230,0.2)',
  track: 'rgba(251,242,230,0.08)',
  action: '#A68BFF',
  actionText: '#120C08',
  actionHover: '#BBA6FF',
  accent: '#A68BFF',
  accentSoft: 'rgba(166,139,255,0.14)',
  accent2: '#5FD9E6',
  live: '#FF6FD8',
  liveSoft: 'rgba(255,111,216,0.14)',
  presence: '#5FD9E6',
  presenceSoft: 'rgba(95,217,230,0.12)',
  reward: '#FFC46B',
  rewardSoft: 'rgba(255,196,107,0.12)',
  focus: '#5FD9E6',
  link: '#BBA6FF',
  tipBg: 'rgba(251,242,230,0.94)',
  pa: ['#EEC1EC', '#C4B8FF', '#A3D4FF', '#8FE9FF'],
  wash: [
    ['#A68BFF', 0.12],
    ['#5FD9E6', 0.1],
  ],
  // Night status: the Thermal room's own hues (colors.css night B).
  success: '#7CC97F',
  warning: '#FFA33A',
  danger: '#FF6A2B',
  info: '#3FD6C8',
}

export const palettes: Record<ColorScheme, Palette> = { light: commons, dark: commonsNight }

/** `--space-1` … `--space-13` (space-motion.css). Index by step, e.g. space[5] = 16. */
export const space = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88, 120] as const

/** Phone gutter, `--gutter-mobile`. */
export const gutter = 18

/** `--radius-s|m|l|xl|orb`. Roles: control = m, card = l, feature = xl, chip = orb. */
export const radius = { s: 10, m: 16, l: 24, xl: 36, orb: 999 } as const

/** `--hit-min`: the smallest tap target. */
export const hitMin = 44

/** `--dur-fast|base|slow` in ms. */
export const duration = { fast: 160, base: 260, slow: 480 } as const

/** The three faces (typography.css), as loaded font family names (src/theme/fonts.ts). */
export const fonts = {
  display: 'Unbounded_600SemiBold',
  displayMedium: 'Unbounded_500Medium',
  displayBold: 'Unbounded_700Bold',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const

/** The type scale (typography.css), phone sizes. Display steps are the h-steps: the
 *  96/64px display sizes are marketing-only and never appear in the member room. */
export const type = {
  h1: { fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontSize: 22, lineHeight: 26, letterSpacing: -0.33 },
  h3: { fontSize: 18, lineHeight: 22, letterSpacing: -0.18 },
  bodyL: { fontSize: 19, lineHeight: 29 },
  body: { fontSize: 16, lineHeight: 25 },
  bodyS: { fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 13, lineHeight: 18 },
  /** `--text-label` 11px, Unbounded, tracked 0.14em, uppercase. */
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 1.54 },
  serifM: { fontSize: 26, lineHeight: 30 },
} as const

/** `--shadow-1` / `--shadow-2` as React Native shadows (iOS props + Android elevation). */
export const shadow = {
  1: { shadowColor: '#1E1B18', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  2: { shadowColor: '#1E1B18', shadowOpacity: 0.28, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 6 },
} as const
