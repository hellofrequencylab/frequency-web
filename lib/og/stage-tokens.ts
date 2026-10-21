// The Frequency "Stage" theme as literals, for Satori, which has no stylesheet.
//
// Values are read off design_handoff/frequency/tokens/themes.css (`[data-theme="stage"]`, the
// always-dark marketing theme) and colors.css (the UV night palette). That folder is the source of
// truth and is never edited; if Stage changes there, change it here. Share cards are public marketing
// surfaces, so they wear Stage whatever theme the viewer's app is in.

export const STAGE = {
  /** --bg-canvas */
  canvas: '#0A0612',
  /** --surface-card */
  surface: '#140B22',
  /** --surface-raised */
  raised: '#1E1232',
  /** --text-strong */
  text: '#F6F0FF',
  /** --text-body */
  body: '#D9CFEA',
  /** --text-muted */
  muted: '#A89BC2',
  /** --border-strong */
  border: 'rgba(246,240,255,0.22)',
  /** --x-violet-neon, --x-magenta-neon, --x-aqua-neon (the aura stops) */
  violet: '#8B5CFF',
  magenta: '#FF2BD6',
  aqua: '#3DF2FF',
  /** --pa: the pastel action gradient, the member-app signature */
  pastel: 'linear-gradient(120deg, #EEC1EC 0%, #C4B8FF 36%, #A3D4FF 68%, #8FE9FF 100%)',
  /** --iridescent-sweep: the marketing signature, used as the thin accent rule */
  iridescent: 'linear-gradient(100deg, #FF9BD8 0%, #B8A2FF 22%, #8FE9FF 45%, #C9FFB8 68%, #FFE7A3 100%)',
  /** --ink: text that sits on the pastel gradient */
  ink: '#1E1B18',
  /** Cancelled / warning chip. */
  danger: '#FCA5A5',
  dangerBg: 'rgba(248,113,113,0.18)',
} as const
