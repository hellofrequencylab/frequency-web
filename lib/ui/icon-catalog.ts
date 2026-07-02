// The semantic icon catalog (docs/ICONS.md, ADR-505). Maps MEANING to an Iconify name so the codebase
// references icons by what they mean (`icon('energy')`), not by raw name. **Lucide (`lucide`) is the
// PRIMARY family** — the set the site already uses in ~897 files, kept as-is. Phosphor (`ph`) + Tabler
// (`tabler`) only FILL GAPS where Lucide has no good glyph (e.g. a real meditation lotus). The
// indirection keeps which set backs a meaning swappable. Names are verified against the installed sets
// (see icon-catalog.test.ts). Pure data, no imports, safe anywhere.

export const ICONS = {
  // ── Brand / Frequency vocabulary ────────────────────────────────────────────────
  energy: 'lucide:zap', // Zaps currency
  award: 'lucide:trophy', // The Field rank ladder
  fieldEnergy: 'lucide:flame', // The Field energy
  magic: 'lucide:sparkles', // AI / Vera
  meditation: 'ph:flower-lotus', // GAP-FILL: Lucide has no lotus; Phosphor does
  breath: 'lucide:wind',
  star: 'lucide:star',
  heart: 'lucide:heart',

  // ── People ──────────────────────────────────────────────────────────────────────
  people: 'lucide:users',
  person: 'lucide:user',
  addPerson: 'lucide:user-plus',

  // ── Place & time ────────────────────────────────────────────────────────────────
  place: 'lucide:map-pin',
  time: 'lucide:clock',
  calendar: 'lucide:calendar-check',
  calendarPlus: 'lucide:calendar-plus',

  // ── Core actions ────────────────────────────────────────────────────────────────
  confirm: 'lucide:check',
  success: 'lucide:circle-check',
  close: 'lucide:x',
  error: 'lucide:circle-x',
  add: 'lucide:plus',
  remove: 'lucide:trash-2',
  edit: 'lucide:pencil',
  copy: 'lucide:copy',
  download: 'lucide:download',
  upload: 'lucide:upload',
  send: 'lucide:send',
  reset: 'lucide:rotate-ccw',

  // ── Navigation / chrome ─────────────────────────────────────────────────────────
  search: 'lucide:search',
  filter: 'lucide:funnel',
  settings: 'lucide:settings',
  menu: 'lucide:menu',
  more: 'lucide:ellipsis',
  home: 'lucide:house',
  bell: 'lucide:bell',
  chat: 'lucide:message-circle',
  loading: 'lucide:loader-circle',
  view: 'lucide:eye',
  lock: 'lucide:lock',
  info: 'lucide:info',
  warning: 'lucide:triangle-alert',
  announce: 'lucide:megaphone',

  // ── Wayfinding ──────────────────────────────────────────────────────────────────
  globe: 'lucide:globe',
  compass: 'lucide:compass',
  link: 'lucide:link',
  external: 'lucide:external-link',
  next: 'lucide:arrow-right',
  prev: 'lucide:arrow-left',
  chevronRight: 'lucide:chevron-right',
  chevronLeft: 'lucide:chevron-left',
  chevronDown: 'lucide:chevron-down',
} as const

export type IconKey = keyof typeof ICONS

/** The Iconify name for a semantic key. Use with <Icon name={icon('energy')} />. */
export function icon(key: IconKey): string {
  return ICONS[key]
}
