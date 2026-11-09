// THE BUILDER'S ONE STATE MODULE (BLD-101, docs/EDITOR-NEXT.md#bld-101; spec docs/design/frequency-builder-v3/
// block-editor-spec.md §1). Every panel of the new builder reads this state and changes it only through
// `builderReducer`; components hold no section state. Pure: no React, no I/O, so the whole editor's behaviour
// is testable as data. The document it edits is the same WebsiteSnapshot the current editor saves, so the two
// editors open, save and publish the same drafts and either can be switched off without a migration.

import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'

/** Undo depth from the spec (§1: "history / future: 60 deep"). */
export const BUILDER_HISTORY_DEPTH = 60

export type BuilderDevice = 'desktop' | 'tablet' | 'phone'
type BuilderSurface = 'site' | 'profile' | 'spotlight' | 'email'
/** §2 save state: a dot plus a word. `conflict` and `error` keep the draft on the device until a save lands. */
type BuilderSave = 'saved' | 'unsaved' | 'saving' | 'offline' | 'error' | 'conflict'

/** The canvas frame width for each device (§2 Canvas). */
export const BUILDER_DEVICE_WIDTH: Record<BuilderDevice, number> = { desktop: 1280, tablet: 820, phone: 390 }

export interface BuilderState {
  draft: WebsiteSnapshot
  /** The saved revision the next save builds on (optimistic concurrency with the server). */
  revision: number
  /** What is live now, for the Publish button's "Published" state. */
  published: WebsiteSnapshot | null
  pageSlug: string
  selectedId: string | null
  device: BuilderDevice
  surface: BuilderSurface
  preview: boolean
  save: BuilderSave
  past: WebsiteSnapshot[]
  future: WebsiteSnapshot[]
  /** The burst the last edit belonged to: typing into one field is one undo step, not one per key (BLD-105). */
  burst: string | null
}

type BuilderAction =
  | { type: 'select'; id: string | null }
  | { type: 'page'; slug: string }
  | { type: 'device'; device: BuilderDevice }
  | { type: 'surface'; surface: BuilderSurface }
  | { type: 'preview'; on: boolean }
  | { type: 'edit'; draft: WebsiteSnapshot; burst?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saving' }
  | { type: 'saved'; state: WebsiteEditorState; publish: boolean }
  | { type: 'save-failed'; conflict?: boolean }
  | { type: 'offline'; offline: boolean }

export function builderInit(initial: WebsiteEditorState): BuilderState {
  const first = initial.draft.pages[0]
  return {
    draft: initial.draft, revision: initial.revision, published: initial.published,
    pageSlug: first?.slug ?? 'home', selectedId: first?.doc.content[0]?.props.id ?? null,
    device: 'desktop', surface: 'site', preview: false, save: 'saved', past: [], future: [], burst: null,
  }
}

export function builderPage(state: BuilderState) {
  return state.draft.pages.find((p) => p.slug === state.pageSlug) ?? state.draft.pages[0]
}

/** True when the draft differs from what is live (the Publish button reads it). */
export function builderDirty(state: BuilderState): boolean {
  if (!state.published) return true
  const strip = (s: WebsiteSnapshot) => JSON.stringify({ ...s, pages: s.pages.map((p) => ({ ...p, comments: [] })), themes: undefined, activeTheme: undefined, liveTheme: undefined })
  return strip(state.draft) !== strip(state.published)
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id, burst: null }
    case 'page': {
      const page = state.draft.pages.find((p) => p.slug === action.slug)
      return page ? { ...state, pageSlug: page.slug, selectedId: page.doc.content[0]?.props.id ?? null } : state
    }
    case 'device':
      return { ...state, device: action.device }
    case 'surface':
      return { ...state, surface: action.surface }
    case 'preview':
      return { ...state, preview: action.on, selectedId: action.on ? null : state.selectedId }
    case 'edit': {
      if (action.draft === state.draft) return state
      const save = state.save === 'offline' ? 'offline' : 'unsaved'
      // The next key in the same field folds into the step it started, so one undo takes back the whole word.
      if (action.burst && action.burst === state.burst && state.past.length) return { ...state, draft: action.draft, future: [], save }
      return { ...state, draft: action.draft, past: [...state.past, state.draft].slice(-BUILDER_HISTORY_DEPTH), future: [], save, burst: action.burst ?? null }
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return { ...state, draft: previous, past: state.past.slice(0, -1), future: [state.draft, ...state.future].slice(0, BUILDER_HISTORY_DEPTH), save: 'unsaved', burst: null }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return { ...state, draft: next, future: state.future.slice(1), past: [...state.past, state.draft].slice(-BUILDER_HISTORY_DEPTH), save: 'unsaved', burst: null }
    }
    case 'saving':
      return { ...state, save: 'saving' }
    case 'saved':
      // An edit made while the save was in flight stays unsaved; the next save carries it.
      return { ...state, revision: action.state.revision, published: action.state.published, save: state.save === 'saving' ? 'saved' : state.save }
    case 'save-failed':
      return { ...state, save: action.conflict ? 'conflict' : 'error' }
    case 'offline':
      return { ...state, save: action.offline ? 'offline' : state.save === 'offline' ? 'unsaved' : state.save }
  }
}

/** The words beside the save dot (§2 Header). */
export function builderSaveLabel(save: BuilderSave): string {
  switch (save) {
    case 'saved': return 'Saved'
    case 'unsaved': return 'Unsaved changes'
    case 'saving': return 'Saving'
    case 'offline': return 'Offline · changes kept here'
    case 'conflict': return 'Changed somewhere else · reload to see it'
    case 'error': return 'Not saved · trying again'
  }
}

/** Opt in to the new builder: the `?builder=v3` address on the editor, the BUILDER_V3 switch for everyone, or a Space
 *  in the BUILDER_V3_SPACES cohort (BLD-108: internal Spaces first, then a cohort, then everyone). `?builder=classic`
 *  always wins, so an owner in the cohort can still open the current editor. Off, the current editor renders
 *  unchanged (BLD-101 done-when). */
export function builderV3Requested(param: string | string[] | undefined, envOn: boolean, cohort: ReadonlySet<string> = new Set(), spaceSlug?: string | null): boolean {
  const value = Array.isArray(param) ? param[0] : param
  if (value === 'classic') return false
  return envOn || value === 'v3' || (!!spaceSlug && cohort.has(spaceSlug.trim().toLowerCase()))
}

/** The BUILDER_V3_SPACES cohort: Space slugs, comma or space separated, any case. Blank is nobody. */
export function builderV3Cohort(raw: string | null | undefined): ReadonlySet<string> {
  return new Set((raw ?? '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))
}
