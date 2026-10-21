// The Frequency "Stage" theme as literals, for Satori, which has no stylesheet.
//
// Values are the Stage theme as the app wears it: the cool blue-black ladder and cool greys of
// app/themes/frequency.css, since ADR-1792 retired the violet and purple-black the handoff export
// still carries. scripts/probes/violet-family.mjs fails on any hex in that band. That folder is the source of
// truth and is never edited; if Stage changes there, change it here. Share cards are public marketing
// surfaces, so they wear Stage whatever theme the viewer's app is in.

export const STAGE = {
  /** --bg-canvas */
  canvas: '#070B14',
  /** --surface-card */
  surface: '#0C1424',
  /** --surface-raised */
  raised: '#121C2E',
  /** --text-strong */
  text: '#F2F5FA',
  /** --text-body */
  body: '#C9D3E0',
  /** --text-muted */
  muted: '#98A6BC',
  /** --border-strong */
  border: 'rgba(242,245,250,0.22)',
  /** --x-sky-neon, --x-magenta-neon, --x-aqua-neon (the aura stops; violet was retired, ADR-1792) */
  sky: '#A3D4FF',
  magenta: '#FF2BD6',
  aqua: '#3DF2FF',
  /** --pa: the pastel action gradient, the member-app signature */
  pastel: 'linear-gradient(120deg, #EEC1EC 0%, #A3D4FF 56%, #8FE9FF 100%)',
  /** --iridescent-sweep: the marketing signature, used as the thin accent rule */
  iridescent: 'linear-gradient(100deg, #FF9BD8 0%, #A3D4FF 24%, #8FE9FF 45%, #C9FFB8 68%, #FFE7A3 100%)',
  /** --ink: text that sits on the pastel gradient */
  ink: '#1E1B18',
  /** Cancelled / warning chip. */
  danger: '#FCA5A5',
  dangerBg: 'rgba(248,113,113,0.18)',
} as const
