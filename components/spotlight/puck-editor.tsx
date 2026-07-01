'use client'

import { useMemo, useState } from 'react'
import { Puck, usePuck, type Data } from '@measured/puck'
import '@measured/puck/puck.css'
import '@/components/page-editor/puck-theme.css'
import Link from 'next/link'
import { Check, Palette, X } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { spotlightLayoutToPuck, puckToSpotlightLayout } from '@/lib/spotlight/puck/convert'
import { linktreePreset } from '@/lib/page-editor/templates/linktree'
import type { SpotlightLayout, SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import type { SpotlightTheme } from '@/lib/spotlight/theme'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import { saveSpotlightLayout } from '@/app/(main)/settings/profile/spotlight-actions'
import { SpotlightThemeEditor } from './theme-editor'
import { SpotlightPublishBar } from './publish-bar'
import { SpotlightBackgroundEditor, SpotlightTopFriendsPicker } from './spotlight-chrome'
import { ResponsiveEditor } from '@/components/page-editor/mobile/responsive-editor'
import { EMPTY_SPOTLIGHT_META, type SpotlightPuckMetadata } from '@/lib/spotlight/puck/metadata'

// THE SPOTLIGHT EDITOR, RUNNING ON THE SHARED <Puck> ENGINE (Phase 3). The member arranges
// their link-tree body from the SAME block library + editor a brand Space uses. It mirrors
// the marketing/Space editor pattern (components/page-editor/editor.tsx): full-screen Puck,
// live state read via usePuck(), a Publish button that persists through a server action.
//
// SAVE PATH (migration-free bridge): on Save the Puck document is lowered back into the
// stored SpotlightLayout schema by the pure converter (puckToSpotlightLayout), then handed
// to the UNCHANGED, owner-gated saveSpotlightLayout server action, which VALIDATES it
// against the same allowlist as before (asset paths pinned to the owner, hex clamped, embed
// refs re-checked). No new write path, no schema change, no loss of the privacy boundary.
//
// The THEME editor is kept. On DESKTOP it lives in a drawer behind the header's "Theme"
// button (unchanged). On MOBILE the same controls ship as a Theme tab in the editor's
// control dock — an overlap-free bottom sheet rather than a `fixed inset-0` drawer that
// covered the top bar. Both surfaces render one shared `ThemePanelContent`, so the theme
// + publish flow is identical either way. It saves itself through its own server actions,
// independent of the block Save. The identity header + theme live outside the Puck body,
// so the editor only composes the block body.

// The shared theme + publish controls, rendered identically in the desktop drawer and the
// mobile Theme panel. Kept as a single component so the two surfaces never drift.
function ThemePanelContent({
  handle,
  published,
  theme,
  onThemeChange,
  initialBackground,
  initialTopFriends,
  friendChoices,
}: {
  handle: string
  published: boolean
  theme: SpotlightTheme
  onThemeChange: (t: SpotlightTheme) => void
  initialBackground: SpotlightBackground
  initialTopFriends: TopFriend[]
  friendChoices: TopFriend[]
}) {
  return (
    <div className="space-y-6">
      <SpotlightPublishBar handle={handle} initialPublished={published} />
      <SpotlightThemeEditor value={theme} onChange={onThemeChange} showPreview={false} />
      <SpotlightBackgroundEditor initial={initialBackground} />
      <SpotlightTopFriendsPicker initialSelected={initialTopFriends} choices={friendChoices} />
    </div>
  )
}

// Publish button: converts the live Puck document to a SpotlightLayout and saves it. Dirty
// tracking mirrors the marketing editor (baseline captured after Puck's own init).
function SaveButton() {
  const { appState } = usePuck()
  const current = JSON.stringify(appState.data)
  const [baseline, setBaseline] = useState(current)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  const dirty = current !== baseline

  async function handleSave() {
    if (!dirty || status === 'saving') return
    setStatus('saving')
    try {
      const layout: SpotlightLayout = puckToSpotlightLayout(appState.data)
      const res = await saveSpotlightLayout(layout)
      if (res.error) {
        setStatus('error')
        return
      }
      setBaseline(JSON.stringify(appState.data))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  const label = status === 'saving' ? 'Saving…' : status === 'error' ? 'Retry save' : dirty ? 'Save' : 'Saved'
  const active = dirty || status === 'error'

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={!active || status === 'saving'}
      title={dirty ? 'Save your Spotlight blocks' : 'No changes to save'}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover' : 'bg-surface-elevated text-subtle cursor-default'
      } ${status === 'saving' ? 'opacity-70' : ''}`}
    >
      {!dirty && status === 'idle' && <Check className="h-4 w-4" />}
      {label}
    </button>
  )
}

export function SpotlightPuckEditor({
  handle,
  published,
  initialLayout,
  initialTheme,
  initialBackground,
  initialTopFriends,
  friendChoices,
}: {
  handle: string
  published: boolean
  initialLayout: SpotlightLayout
  initialTheme: SpotlightTheme
  initialBackground: SpotlightBackground
  initialTopFriends: TopFriend[]
  friendChoices: TopFriend[]
}) {
  // Seed the editor from the member's saved layout, bridged into a Puck document. An empty
  // layout starts from the designed link-tree preset, so a new Spotlight opens on a page.
  const initialData: Data =
    initialLayout.blocks.length > 0 ? spotlightLayoutToPuck(initialLayout) : linktreePreset()

  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState<SpotlightTheme>(initialTheme)

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
  // top bar, so the theme + publish flow is identical on both.
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
                  <Link
                    href="/settings/profile"
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
                  >
                    ← Exit
                  </Link>
                  {themeButton}
                  <SaveButton />
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
          // Spotlight persists its blocks through saveSpotlightLayout (the SAME converter +
          // owner-gated, validating action the desktop SaveButton uses). That IS the live
          // write for an enabled Spotlight, so autosave and the deliberate action both call
          // it; on/off "publish" stays in the theme drawer's SpotlightPublishBar.
          onSaveDraft: async (doc) => {
            const res = await saveSpotlightLayout(puckToSpotlightLayout(doc))
            if (res.error) throw new Error(res.error)
          },
          onPublish: async (doc) => {
            const res = await saveSpotlightLayout(puckToSpotlightLayout(doc))
            if (res.error) throw new Error(res.error)
          },
          publishLabel: 'Save',
          publishedMessage: 'Saved',
          publishBusyLabel: 'Saving…',
          // MOBILE: the theme lives in its own dock tab (an overlap-free bottom sheet),
          // NOT the old `fixed inset-0` drawer. Same controls as the desktop drawer via
          // the shared ThemePanelContent.
          panels: [
            {
              key: 'theme',
              label: 'Theme',
              icon: <Palette className="h-5 w-5" aria-hidden />,
              render: () => (
                <ThemePanelContent
                  handle={handle}
                  published={published}
                  theme={theme}
                  onThemeChange={setTheme}
                  initialBackground={initialBackground}
                  initialTopFriends={initialTopFriends}
                  friendChoices={friendChoices}
                />
              ),
            },
          ],
        }}
      />

      {/* Theme drawer: the kept theme editor + the publish bar. It saves itself through its
          own server actions, independent of the block Save. */}
      {themeOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setThemeOpen(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-canvas p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Theme &amp; publish</h2>
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
              onThemeChange={setTheme}
              initialBackground={initialBackground}
              initialTopFriends={initialTopFriends}
              friendChoices={friendChoices}
            />
          </div>
        </div>
      )}
    </div>
  )
}
