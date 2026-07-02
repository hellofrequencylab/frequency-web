'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck, usePuck } from '@measured/puck'
import type { Data } from '@/lib/page-editor/types'
import '@measured/puck/puck.css'
import '@/components/page-editor/puck-theme.css'
import Link from 'next/link'
import { Check, CircleDot, Palette, X } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { spotlightLayoutToPuck, puckToSpotlightLayout } from '@/lib/spotlight/puck/convert'
import { linktreePreset } from '@/lib/page-editor/templates/linktree'
import type { SpotlightLayout, SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import type { SpotlightTheme } from '@/lib/spotlight/theme'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import { saveSpotlightDraft, publishSpotlightDraft } from '@/app/(main)/settings/profile/spotlight-actions'
import { SpotlightThemeEditor } from './theme-editor'
import { SpotlightPublishBar } from './publish-bar'
import { SpotlightBackgroundEditor, SpotlightTopFriendsPicker } from './spotlight-chrome'
import { SpotlightThemeSlots } from './theme-slots'
import { ResponsiveEditor } from '@/components/page-editor/mobile/responsive-editor'
import { EMPTY_SPOTLIGHT_META, type SpotlightPuckMetadata } from '@/lib/spotlight/puck/metadata'
import type { SpotlightThemeSlot } from '@/lib/profile/spotlight-flags'
import { SpotlightLivePreview } from './spotlight-live-preview'
import type { SpotlightIdentity } from './spotlight-identity'

// THE SPOTLIGHT EDITOR, RUNNING ON THE SHARED <Puck> ENGINE (Phase 3). The member arranges
// their link-tree body from the SAME block library + editor a brand Space uses. It mirrors
// the marketing/Space editor pattern (components/page-editor/editor.tsx): full-screen Puck,
// live state read via usePuck().
//
// DRAFT → PUBLISH (the working-copy split): every edit — blocks, theme, background — autosaves
// (debounced) into ONE draft node (meta.spotlight.draft) via saveSpotlightDraft. The draft never
// touches what the public page renders; a deliberate PUBLISH promotes the whole working copy
// (layout + theme + background) to the live nodes via publishSpotlightDraft. So the public page
// keeps showing the last published version until the member chooses to go live, and reopening the
// editor resumes the draft. The three parts save TOGETHER (one debounced writer captures the
// current Puck doc + the current theme + the current background), so no edit is ever lost.
//
// The THEME editor is kept. On DESKTOP it lives in a drawer behind the header's "Theme" button;
// on MOBILE the same controls ship as a Theme tab in the control dock. Both surfaces render one
// shared `ThemePanelContent`, so the theme flow is identical either way. Theme + background edits
// route through the SAME draft autosave (they no longer self-save to the live nodes from here).
// The on/off VISIBILITY toggle (SpotlightPublishBar) is separate: it controls whether the public
// page is turned on, distinct from promoting a draft.

/** The shared draft writer + its status, handed down to every edit surface so blocks, theme, and
 *  background all funnel through ONE debounced save. `saveDraft` captures the CURRENT three parts
 *  (the Puck doc via a ref, plus theme + background) and persists them together. */
type DraftController = {
  /** Persist the current layout + theme + background as the working draft (debounced). Pass a
   *  fresh Puck doc to capture a block edit; omit to reuse the last-known doc (theme/bg edits). */
  saveDraft: (doc?: Data) => void
  /** Promote the current working copy to the live nodes (deliberate Publish). Flushes any pending
   *  draft first, then publishes the exact current three. Marks the editor clean on success. */
  publish: (doc?: Data) => Promise<void>
  /** Keep the ref that holds the latest Puck doc in sync (called by the in-Puck autosave watcher). */
  setLayoutDoc: (doc: Data) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  publishState: 'idle' | 'publishing' | 'error'
  hasUnpublishedChanges: boolean
}

// The shared theme + publish controls, rendered identically in the desktop drawer and the
// mobile Theme panel. Kept as a single component so the two surfaces never drift.
function ThemePanelContent({
  handle,
  published,
  theme,
  onThemeChange,
  initialBackground,
  background,
  onBackgroundChange,
  themeSlots,
  initialTopFriends,
  friendChoices,
}: {
  handle: string
  published: boolean
  theme: SpotlightTheme
  onThemeChange: (t: SpotlightTheme) => void
  initialBackground: SpotlightBackground
  /** The live background, lifted so applying a saved theme updates it too. */
  background: SpotlightBackground
  onBackgroundChange: (next: SpotlightBackground) => void
  themeSlots: SpotlightThemeSlot[]
  initialTopFriends: TopFriend[]
  friendChoices: TopFriend[]
}) {
  return (
    <div className="space-y-6">
      <SpotlightPublishBar handle={handle} initialPublished={published} />
      {/* My themes: save the current look, apply / rename / delete a saved one (max 3). Applying a
          slot pushes its theme + background into the live editor state below, which autosaves the draft. */}
      <SpotlightThemeSlots
        initialSlots={themeSlots}
        currentTheme={theme}
        currentBackground={background}
        onApply={(t, bg) => { onThemeChange(t); onBackgroundChange(bg) }}
        applyToDraftOnly
      />
      {/* Theme + background edits update parent state (which triggers the draft autosave). They no
          longer self-save to the LIVE nodes from the editor — `onCommit` routes their explicit save
          buttons to the shared draft save too, so a click there saves the draft, not the live page. */}
      <SpotlightThemeEditor value={theme} onChange={onThemeChange} onCommit={onThemeChange} showPreview={false} />
      <SpotlightBackgroundEditor initial={initialBackground} value={background} onChange={onBackgroundChange} onCommit={onBackgroundChange} />
      <SpotlightTopFriendsPicker initialSelected={initialTopFriends} choices={friendChoices} />
    </div>
  )
}

// An invisible child mounted INSIDE <Puck> so it can read the live document via usePuck(). It keeps
// the parent's layout ref in sync and triggers the debounced draft save on every block change — the
// desktop equivalent of the mobile editor's autosave. Dirty tracking mirrors the marketing editor
// (baseline captured after Puck's own init) so the very first render doesn't count as an edit.
function DraftAutosaveWatcher({ controller }: { controller: DraftController }) {
  const { appState } = usePuck()
  const doc = appState.data
  const serialized = JSON.stringify(doc)
  const baselineRef = useRef(serialized)

  useEffect(() => {
    controller.setLayoutDoc(doc)
    if (serialized === baselineRef.current) return // Puck's own init / no real change.
    baselineRef.current = serialized
    controller.saveDraft(doc)
    // Only react to a genuine document change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized])

  return null
}

// Desktop header actions: an explicit "Save" (writes the draft now) and the primary green
// "Publish" (promotes the draft to the live public page). Autosave already fires on every edit;
// Save is a manual flush, Publish is the deliberate go-live.
function DraftSaveButton({ controller }: { controller: DraftController }) {
  const { appState } = usePuck()
  const saving = controller.saveState === 'saving'
  const label =
    controller.saveState === 'saving' ? 'Saving…'
    : controller.saveState === 'error' ? 'Retry save'
    : controller.saveState === 'saved' ? 'Draft saved'
    : 'Save'

  return (
    <button
      type="button"
      onClick={() => controller.saveDraft(appState.data)}
      disabled={saving}
      title="Save your draft (only you can see it until you publish)"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated ${
        saving ? 'opacity-70' : ''
      }`}
    >
      {controller.saveState === 'saved' && <Check className="h-4 w-4" />}
      {label}
    </button>
  )
}

function PublishButton({ controller }: { controller: DraftController }) {
  const { appState } = usePuck()
  const publishing = controller.publishState === 'publishing'
  const active = controller.hasUnpublishedChanges || controller.publishState === 'error'
  const label =
    publishing ? 'Publishing…'
    : controller.publishState === 'error' ? 'Retry publish'
    : active ? 'Publish'
    : 'Published'

  return (
    <button
      type="button"
      onClick={() => { void controller.publish(appState.data) }}
      disabled={!active || publishing}
      title={active ? 'Publish your changes to your live Spotlight page' : 'Your live page is up to date'}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-success text-on-primary shadow-sm hover:bg-success/90' : 'bg-surface-elevated text-subtle cursor-default'
      } ${publishing ? 'opacity-70' : ''}`}
    >
      {!active && !publishing && <Check className="h-4 w-4" />}
      {label}
    </button>
  )
}

// A small "Unpublished changes" indicator for the header, so the member always knows there is
// a draft that isn't live yet. Seeded from the server (a resumed draft), set on every edit,
// cleared on publish.
function UnpublishedBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg/50 px-2.5 py-1 text-xs font-semibold text-warning"
      title="You have edits saved as a draft that are not on your live page yet."
    >
      <CircleDot className="h-3.5 w-3.5" aria-hidden /> Unpublished changes
    </span>
  )
}

export function SpotlightPuckEditor({
  handle,
  published,
  identity,
  initialLayout,
  initialTheme,
  initialBackground,
  initialThemeSlots,
  initialTopFriends,
  friendChoices,
  hasUnpublishedChanges: initialHasUnpublished = false,
}: {
  handle: string
  published: boolean
  /** The owner's identity (avatar, name, role, region, bio, header image) so the mobile WYSIWYG
   *  preview can render the FULL themed page, not just the block body. */
  identity: SpotlightIdentity
  initialLayout: SpotlightLayout
  initialTheme: SpotlightTheme
  initialBackground: SpotlightBackground
  initialThemeSlots: SpotlightThemeSlot[]
  initialTopFriends: TopFriend[]
  friendChoices: TopFriend[]
  /** True when the editor was seeded from a saved draft (edits not yet published). */
  hasUnpublishedChanges?: boolean
}) {
  // Seed the editor from the member's saved layout (draft-else-live, resolved in page.tsx), bridged
  // into a Puck document. An empty layout starts from the designed link-tree preset.
  const initialData: Data =
    initialLayout.blocks.length > 0 ? spotlightLayoutToPuck(initialLayout) : linktreePreset()

  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState<SpotlightTheme>(initialTheme)
  // Background is lifted here (not just held inside SpotlightBackgroundEditor) so applying a saved
  // theme slot can update the live background alongside the theme in one gesture — and so the shared
  // draft save can capture it alongside the theme + layout.
  const [background, setBackground] = useState<SpotlightBackground>(initialBackground)
  const [hasUnpublished, setHasUnpublished] = useState(initialHasUnpublished)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')

  // Refs mirror the CURRENT three parts for the debounced/deferred writers (never read during
  // render). `layoutDocRef` is fed the live Puck doc by DraftAutosaveWatcher; theme/background
  // refs track their state so a keystroke's debounced flush always saves the latest values.
  const layoutDocRef = useRef<Data>(initialData)
  const themeRef = useRef(theme)
  const backgroundRef = useRef(background)
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { backgroundRef.current = background }, [background])
  const saveTimer = useRef<number | null>(null)
  const savedResetTimer = useRef<number | null>(null)

  // The ONE debounced draft writer: captures the current layout + theme + background and persists
  // them together into meta.spotlight.draft. Any edit path (blocks, theme, background) calls this.
  const flushDraft = useCallback(async () => {
    setSaveState('saving')
    try {
      const layout = puckToSpotlightLayout(layoutDocRef.current)
      const res = await saveSpotlightDraft(layout, themeRef.current, backgroundRef.current)
      if (res.error) { setSaveState('error'); return }
      setSaveState('saved')
      if (savedResetTimer.current) window.clearTimeout(savedResetTimer.current)
      savedResetTimer.current = window.setTimeout(
        () => setSaveState((s) => (s === 'saved' ? 'idle' : s)),
        1600,
      )
    } catch {
      setSaveState('error')
    }
  }, [])

  const saveDraft = useCallback(
    (doc?: Data) => {
      if (doc) layoutDocRef.current = doc
      setHasUnpublished(true)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = window.setTimeout(() => { void flushDraft() }, 700)
    },
    [flushDraft],
  )

  const publish = useCallback(
    async (doc?: Data) => {
      if (doc) layoutDocRef.current = doc
      if (publishState === 'publishing') return
      setPublishState('publishing')
      // Flush any pending debounced draft first so the draft node matches what we publish.
      if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null }
      try {
        const layout = puckToSpotlightLayout(layoutDocRef.current)
        await saveSpotlightDraft(layout, themeRef.current, backgroundRef.current)
        const res = await publishSpotlightDraft(layout, themeRef.current, backgroundRef.current)
        if (res.error) { setPublishState('error'); return }
        setPublishState('idle')
        setHasUnpublished(false)
        setSaveState('idle')
      } catch {
        setPublishState('error')
      }
    },
    [publishState],
  )

  const setLayoutDoc = useCallback((doc: Data) => { layoutDocRef.current = doc }, [])

  // Flush a pending save on unmount so nothing is lost when leaving the editor.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        void flushDraft()
      }
      if (savedResetTimer.current) window.clearTimeout(savedResetTimer.current)
    }
  }, [flushDraft])

  const controller: DraftController = {
    saveDraft,
    publish,
    setLayoutDoc,
    saveState,
    publishState,
    hasUnpublishedChanges: hasUnpublished,
  }

  // Theme + background edits: update state AND trigger the shared draft save. Wrapped so every
  // edit surface (the theme editor onChange, the background onChange, applying a saved slot) routes
  // through one place.
  const onThemeChange = useCallback((next: SpotlightTheme) => {
    themeRef.current = next
    setTheme(next)
    saveDraft()
  }, [saveDraft])
  const onBackgroundChange = useCallback((next: SpotlightBackground) => {
    backgroundRef.current = next
    setBackground(next)
    saveDraft()
  }, [saveDraft])

  // The render metadata the Spotlight blocks read at edit time (the SAME channel the public
  // <Render> uses). Without it the Image/Gallery blocks resolve their URL against an empty
  // base and render broken — the bug behind "my images disappeared". `publicBase` is the
  // public avatars bucket (client-safe env, matching components/spotlight/blocks/render.tsx);
  // Top Friends are the owner's resolved list; live Stat numbers stay on the public page.
  const spotlightMeta: SpotlightPuckMetadata = useMemo(
    () => ({
      spotlight: {
        ...EMPTY_SPOTLIGHT_META,
        publicBase: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`,
        topFriends: initialTopFriends,
      },
    }),
    [initialTopFriends],
  )

  // The Theme button opens the kept drawer. Shared by the desktop header and the mobile
  // top bar, so the theme flow is identical on both.
  const themeButton = (
    <button
      type="button"
      onClick={() => setThemeOpen((v) => !v)}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
    >
      <Palette className="h-4 w-4" aria-hidden /> Theme
    </button>
  )

  return (
    <div className="relative">
      <ResponsiveEditor
        desktop={
          <Puck
            config={config}
            data={initialData}
            metadata={spotlightMeta}
            headerTitle="Build your Spotlight"
            overrides={{
              headerActions: () => (
                <>
                  {/* Invisible: watches the live Puck doc and autosaves it into the draft. */}
                  <DraftAutosaveWatcher controller={controller} />
                  <Link
                    href="/settings/profile"
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
                  >
                    ← Exit
                  </Link>
                  <UnpublishedBadge show={hasUnpublished} />
                  {themeButton}
                  <DraftSaveButton controller={controller} />
                  <PublishButton controller={controller} />
                </>
              ),
            }}
          />
        }
        mobile={{
          config,
          data: initialData,
          metadata: spotlightMeta as unknown as Record<string, unknown>,
          title: 'Build your Spotlight',
          // Blocks autosave into the DRAFT on every edit (onSaveDraft, debounced by the mobile
          // editor). The deliberate action PUBLISHES: it promotes the draft (layout + theme +
          // background) to the live public page. On/off VISIBILITY stays in the theme drawer's
          // SpotlightPublishBar (a separate concern from draft → publish).
          onSaveDraft: async (doc) => {
            const layout = puckToSpotlightLayout(doc)
            layoutDocRef.current = doc
            setHasUnpublished(true)
            const res = await saveSpotlightDraft(layout, themeRef.current, backgroundRef.current)
            if (res.error) throw new Error(res.error)
          },
          onPublish: async (doc) => {
            const layout = puckToSpotlightLayout(doc)
            layoutDocRef.current = doc
            const res = await publishSpotlightDraft(layout, themeRef.current, backgroundRef.current)
            if (res.error) throw new Error(res.error)
            setHasUnpublished(false)
          },
          publishLabel: 'Publish',
          publishedMessage: 'Published',
          publishBusyLabel: 'Publishing…',
          // MOBILE WYSIWYG: the preview IS the member's ACTUAL themed Spotlight page (identity +
          // gradient/background + glass cards + fonts + accent), rendered from LIVE editor state
          // and updating as they edit. Tapping a block on it opens that block's field form in a
          // popup (onEditBlock → the tall bottom sheet), so tap-to-edit is the primary flow.
          renderPreview: ({ data, onEditBlock }) => (
            <SpotlightLivePreview
              config={config}
              data={data}
              theme={theme}
              background={background}
              identity={identity}
              metadata={spotlightMeta as unknown as Record<string, unknown>}
              onEditBlock={onEditBlock}
            />
          ),
          // The theme + background settings sit BELOW the preview in the SAME scroll, so the member
          // scrolls down to adjust them and watches the themed preview change live. Their handlers
          // autosave the DRAFT (onThemeChange/onBackgroundChange), so a colour or background tweak is
          // captured exactly like a block edit.
          settingsBelow: (
            <ThemePanelContent
              handle={handle}
              published={published}
              theme={theme}
              onThemeChange={onThemeChange}
              initialBackground={initialBackground}
              background={background}
              onBackgroundChange={onBackgroundChange}
              themeSlots={initialThemeSlots}
              initialTopFriends={initialTopFriends}
              friendChoices={friendChoices}
            />
          ),
        }}
      />

      {/* Theme drawer: the kept theme editor + the visibility bar. Theme/background edits here route
          through the shared draft autosave (they no longer self-save to the live nodes). */}
      {themeOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setThemeOpen(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-canvas p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Theme &amp; visibility</h2>
              <button
                type="button"
                onClick={() => setThemeOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-surface-elevated hover:text-text"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ThemePanelContent
              handle={handle}
              published={published}
              theme={theme}
              onThemeChange={onThemeChange}
              initialBackground={initialBackground}
              background={background}
              onBackgroundChange={onBackgroundChange}
              themeSlots={initialThemeSlots}
              initialTopFriends={initialTopFriends}
              friendChoices={friendChoices}
            />
          </div>
        </div>
      )}
    </div>
  )
}
