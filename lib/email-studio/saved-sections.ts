// SAVED SECTIONS (EMAIL-040). An operator can keep a block they built (its type and content) and drop a copy into
// any other email. This file is the browser-storage library, the fallback for an editor with no shared one; the
// Email Studio uses the shared table instead (EMAIL-042, saved-sections-actions.ts) through the same SavedLibrary
// shape. Storage is injected so the rules (cap, name, bad data) are testable and the editor can run without
// storage (private windows).

export interface SavedSection {
  id: string
  name: string
  type: string
  content: Record<string, unknown>
}

/** Where an editor keeps its saved sections. Each call resolves to the new list, or null when it was refused. */
export interface SavedLibrary {
  list(): Promise<SavedSection[] | null>
  save(input: { name: string; type: string; content: Record<string, unknown> }, fallbackName: string): Promise<SavedSection[] | null>
  remove(id: string): Promise<SavedSection[] | null>
}

const SAVED_SECTIONS_KEY = 'fq-email-saved-sections'
const SAVED_SECTIONS_MAX = 40
const NAME_MAX = 60

type Store = Pick<Storage, 'getItem' | 'setItem'>

function isSection(v: unknown): v is SavedSection {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.type === 'string' &&
    !!s.content &&
    typeof s.content === 'object' &&
    !Array.isArray(s.content)
  )
}

export function loadSavedSections(store: Store | null): SavedSection[] {
  if (!store) return []
  try {
    const raw = store.getItem(SAVED_SECTIONS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isSection).slice(0, SAVED_SECTIONS_MAX) : []
  } catch {
    return []
  }
}

function persist(store: Store | null, list: SavedSection[]): boolean {
  if (!store) return false
  try {
    store.setItem(SAVED_SECTIONS_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Keep a copy of a block under a name (blank falls back to the block's own label). The newest comes first; a
 *  full library drops its oldest. Returns the new list, or null when storage refused the write. */
export function saveSection(
  store: Store | null,
  input: { name: string; type: string; content: Record<string, unknown> },
  fallbackName: string,
): SavedSection[] | null {
  const name = input.name.trim().slice(0, NAME_MAX) || fallbackName
  const entry: SavedSection = {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    type: input.type,
    content: structuredClone(input.content),
  }
  const next = [entry, ...loadSavedSections(store)].slice(0, SAVED_SECTIONS_MAX)
  return persist(store, next) ? next : null
}

export function deleteSection(store: Store | null, id: string): SavedSection[] {
  const next = loadSavedSections(store).filter((s) => s.id !== id)
  persist(store, next)
  return next
}
