// The semantic icon catalog (docs/ICONS.md, ADR-505). Maps MEANING to an Iconify name so the codebase
// references icons by what they mean (`icon('energy')`), not by library. That indirection is what makes
// the house family swappable and the migration off lucide-react mechanical: change one line here and
// every surface follows. Phosphor (`ph`) is the house family; names are verified against
// @iconify-json/ph (see icon-catalog.test.ts). Pure data, no imports, safe anywhere.

export const ICONS = {
  // ── Brand / Frequency vocabulary ────────────────────────────────────────────────
  energy: 'ph:lightning-fill', // Zaps currency
  award: 'ph:trophy', // The Field rank ladder
  fieldEnergy: 'ph:flame', // The Field energy
  magic: 'ph:sparkle', // AI / Vera
  meditation: 'ph:flower-lotus', // practices / stillness
  breath: 'ph:wind',
  star: 'ph:star',
  heart: 'ph:heart',

  // ── People ──────────────────────────────────────────────────────────────────────
  people: 'ph:users',
  person: 'ph:user',
  addPerson: 'ph:user-plus',

  // ── Place & time ────────────────────────────────────────────────────────────────
  place: 'ph:map-pin',
  time: 'ph:clock',
  calendar: 'ph:calendar-check',
  calendarPlus: 'ph:calendar-plus',

  // ── Core actions ────────────────────────────────────────────────────────────────
  confirm: 'ph:check',
  success: 'ph:check-circle',
  close: 'ph:x',
  error: 'ph:x-circle',
  add: 'ph:plus',
  remove: 'ph:trash',
  edit: 'ph:pencil-simple',
  copy: 'ph:copy',
  download: 'ph:download-simple',
  upload: 'ph:upload-simple',
  send: 'ph:paper-plane-tilt',
  reset: 'ph:arrow-counter-clockwise',

  // ── Navigation / chrome ─────────────────────────────────────────────────────────
  search: 'ph:magnifying-glass',
  filter: 'ph:funnel',
  settings: 'ph:gear',
  menu: 'ph:list',
  more: 'ph:dots-three',
  home: 'ph:house',
  bell: 'ph:bell',
  chat: 'ph:chat-circle',
  loading: 'ph:circle-notch',
  view: 'ph:eye',
  lock: 'ph:lock',
  info: 'ph:info',
  warning: 'ph:warning',
  announce: 'ph:megaphone',

  // ── Wayfinding ──────────────────────────────────────────────────────────────────
  globe: 'ph:globe',
  compass: 'ph:compass',
  link: 'ph:link',
  external: 'ph:arrow-square-out',
  next: 'ph:arrow-right',
  prev: 'ph:arrow-left',
  chevronRight: 'ph:caret-right',
  chevronLeft: 'ph:caret-left',
  chevronDown: 'ph:caret-down',
} as const

export type IconKey = keyof typeof ICONS

/** The Iconify name for a semantic key. Use with <Icon name={icon('energy')} />. */
export function icon(key: IconKey): string {
  return ICONS[key]
}
