'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, QrCode } from 'lucide-react'
import { EntityLayoutProvider, type SaveLayout } from '@/components/entity-blocks/profile-layout-context'
import { EntityPageBuilder, type BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { NodeLayoutProvider, type SaveNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { NodeLinkListBuilder } from '@/components/entity-blocks/node-link-list-builder'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { Switch } from '@/components/ui/switch'
import { buttonClasses } from '@/components/ui/button'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { UpgradeMoment, type UpgradeMomentSetup } from '@/components/pricing/upgrade-moment'
import { SpotlightPreviewFrame } from '@/components/spotlight/spotlight-preview-frame'
import { SPACE_SPOTLIGHT_BLOCK_IDS } from '@/lib/spaces/spotlight'
import {
  connectSpotlightDomain,
  saveSpaceSpotlightLayout,
  setSpaceSpotlightLook,
  setSpaceSpotlightTheme,
  setSpaceSpotlightPublished,
} from '@/app/(main)/spaces/[slug]/manage/spotlight/actions'

// THE SPACE SPOTLIGHT EDITOR (LIVE-851). The SAME builder the member Spotlight, the Space page and the email
// studio use (EntityPageBuilder over the shared EntityLayoutProvider), mounted here with the Space kind, the
// Spotlight palette and one column, and an injected save that writes only `preferences.spotlight`. Beside it,
// the preview is the real Spotlight page in a phone-width frame (SpotlightPreviewFrame, LIVE-2452): it wears
// only the Space's theme, never the console's, and draws again after every save. The publish switch puts the
// page on the network. Block text is edited in the rail, like the member Spotlight. Voice canon: no em dashes.

export function SpaceSpotlightEditor({
  slug,
  seed,
  initialPublished,
  readOnly,
  upgrade,
  ownLinks,
  clicks,
  looks,
  themes,
}: {
  slug: string
  /** The builder seed: the Spotlight layout plus the Space's locked blocks and picker data. Null when the
   *  viewer cannot edit (a staff previewer), which renders the builder as nothing (fail-safe). */
  seed: BuilderRailData | null
  initialPublished: boolean
  readOnly: boolean
  /** Present when the Space's plan cannot take payments: product, Journey, event and membership cards are
   *  then held back (LIVE-854), and this note offers the upgrade where the owner is choosing cards. */
  upgrade?: UpgradeMomentSetup
  /** The Spotlight's own addresses (LIVE-855): `paid` is `https://<slug>.frequencylocal.com/spotlight` on a plan
   *  that takes payments; `domain` is the Space's served domain, which can carry `spotlight.<domain>` once its
   *  CNAME (`cname`) is set. */
  ownLinks?: { paid: string | null; domain: string | null; cname: string }
  /** Link card presses over the last 30 days, most pressed first (LIVE-856). Absent for a staff previewer. */
  clicks?: { label: string; count: number }[]
  /** The whole-page looks the Space's theme offers, and the one it wears. Absent for a theme with none. */
  looks?: { options: readonly { look: string; label: string; blurb: string }[]; current: string }
  /** The themes whose Spotlight looks exist, and the one the Space wears. The Space needs no website to pick one. */
  themes?: { options: readonly { id: string; label: string }[]; current: string }
}) {
  const router = useRouter()
  const [look, setLook] = useState(looks?.current ?? 'stack')
  const [theme, setTheme] = useState(themes?.current ?? '')
  const save = useCallback<SaveLayout>((payload) => saveSpaceSpotlightLayout(slug, payload), [slug])
  const saveNodes = useCallback<SaveNodeLayout>(
    (layout) => saveSpaceSpotlightLayout(slug, layout as unknown as BuilderLayout),
    [slug],
  )
  // The server page passes a node layout only while render_path_spotlight is on (ADR-1855): the editor then
  // runs on the node store and saves the node document. Absent, nothing about the editor changes.
  const nodePath = !!seed?.nodeLayout
  const loadRailData = useCallback(async () => seed, [seed])
  const [published, setPublished] = useState(initialPublished)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [domainState, setDomainState] = useState<'idle' | 'connected' | string>('idle')
  const [connecting, startConnect] = useTransition()
  // Moves when a theme or look change lands, so the preview frame draws the page again.
  const [previewVersion, setPreviewVersion] = useState(0)
  // The editor's three tabs (LIVE-2455): the page itself first, then its look, then sharing and stats.
  const [tab, setTab] = useState<'page' | 'look' | 'share'>('page')
  // On a phone the editor and the preview take turns; from 1024px both show side by side.
  const [phoneView, setPhoneView] = useState<'edit' | 'preview'>('edit')

  const onConnectDomain = () => {
    startConnect(async () => {
      const res = await connectSpotlightDomain(slug)
      setDomainState(res.error ?? 'connected')
    })
  }

  const onTheme = (next: string) => {
    const prev = theme
    setTheme(next)
    setError(null)
    startTransition(async () => {
      const res = await setSpaceSpotlightTheme(slug, next)
      if (res.error) {
        setTheme(prev)
        setError(res.error)
        return
      }
      setPreviewVersion((v) => v + 1)
      router.refresh()
    })
  }

  const onLook = (next: string) => {
    const prev = look
    setLook(next)
    setError(null)
    startTransition(async () => {
      const res = await setSpaceSpotlightLook(slug, next === 'blocks' ? null : next)
      if (res.error) {
        setLook(prev)
        setError(res.error)
        return
      }
      setPreviewVersion((v) => v + 1)
      router.refresh()
    })
  }

  const onPublish = (next: boolean) => {
    setPublished(next)
    setError(null)
    startTransition(async () => {
      const res = await setSpaceSpotlightPublished(slug, next)
      if (res.error) {
        setPublished(!next)
        setError(res.error)
      }
    })
  }

  const href = `/spaces/${slug}/spotlight`

  const body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
        <SegmentedControl
          label="Edit or preview"
          value={phoneView}
          onChange={setPhoneView}
          segments={[
            { value: 'edit', label: 'Edit' },
            { value: 'preview', label: 'Preview' },
          ]}
          className="justify-self-center lg:hidden"
        />
        <div className={`min-w-0 space-y-4 ${phoneView === 'preview' ? 'hidden lg:block' : ''}`}>
          <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Publish">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p id="spotlight-live" className="text-body-sm font-bold text-text">
                  {published ? 'Your Spotlight is live' : 'Your Spotlight is hidden'}
                </p>
                <p className="text-meta text-muted">
                  {published ? 'Anyone with the link can see it.' : 'Turn it on to get a link you can open and share. The preview shows how it looks.'}
                </p>
              </div>
              <Switch
                checked={published}
                onCheckedChange={onPublish}
                pending={pending}
                disabled={readOnly}
                aria-labelledby="spotlight-live"
              />
            </div>
            {published && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link href={href} target="_blank" className={buttonClasses('primary', 'sm')}>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View your Spotlight
                </Link>
                <span className="text-meta text-muted">frequencylocal.com{href}</span>
                {/* QR & Share (LIVE-853): the Space's QR studio with a code for this page filled in. */}
                <Link
                  href={`/spaces/${slug}/settings/qr?title=Spotlight&target=${encodeURIComponent(href)}`}
                  className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden /> Make a QR code
                </Link>
              </div>
            )}
            {error && (
              <p className="text-meta font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </section>

          <SegmentedControl
            label="Spotlight editor sections"
            value={tab}
            onChange={setTab}
            segments={[
              { value: 'page', label: 'Page' },
              { value: 'look', label: 'Look' },
              { value: 'share', label: 'Share and stats' },
            ]}
          />

          {tab === 'look' && themes && themes.options.length > 0 && (
            <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Theme">
              <p className="text-body-sm font-bold text-text">Theme</p>
              <p className="text-meta text-muted">One theme for your Spotlight, Space and website. You do not need a website to pick one.</p>
              <div className="flex flex-wrap gap-2">
                {themes.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onTheme(o.id)}
                    disabled={readOnly || pending}
                    aria-pressed={theme === o.id}
                    className={choiceTileClasses(theme === o.id, 'rounded-pill px-3 py-1.5 text-body-sm font-semibold text-text')}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {tab === 'look' && looks && looks.options.length > 0 && (
            <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Look">
              <p className="text-body-sm font-bold text-text">Look</p>
              <p className="text-meta text-muted">How your theme lays out this page. The preview shows the one you pick.</p>
              <div className="grid grid-cols-2 gap-2">
                {looks.options.map((o) => (
                  <button
                    key={o.look}
                    type="button"
                    onClick={() => onLook(o.look)}
                    disabled={readOnly || pending}
                    aria-pressed={look === o.look}
                    className={choiceTileClasses(look === o.look, 'rounded-card px-3 py-2 text-left')}
                  >
                    <span className="block text-body-sm font-semibold text-text">{o.label}</span>
                    <span className="block text-meta text-muted">{o.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tab === 'share' && !published && (
            <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-meta text-muted">
              Turn your Spotlight on to get your links, QR code and click counts.
            </p>
          )}

          {tab === 'share' && published && ownLinks && (ownLinks.paid || ownLinks.domain) && (
            <section className="space-y-3 rounded-card border border-border bg-surface p-4" aria-label="Your own links">
              <p className="text-body-sm font-bold text-text">Your own links</p>
              {ownLinks.paid && (
                <a
                  href={ownLinks.paid}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
                >
                  {ownLinks.paid.replace(/^https:\/\//, '')} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
              {ownLinks.domain && (
                <div className="space-y-2">
                  <p className="text-meta text-muted">
                    Put your Spotlight on spotlight.{ownLinks.domain}. At the company that runs your domain, add a
                    CNAME record named <span className="font-semibold text-text">spotlight</span> that points to{' '}
                    <span className="font-semibold text-text">{ownLinks.cname}</span>, then press Connect.
                  </p>
                  {domainState === 'connected' ? (
                    <a
                      href={`https://spotlight.${ownLinks.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
                    >
                      spotlight.{ownLinks.domain} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={onConnectDomain}
                      disabled={readOnly || connecting}
                      className="text-meta font-medium text-primary-strong hover:underline disabled:opacity-60"
                    >
                      {connecting ? 'Connecting' : `Connect spotlight.${ownLinks.domain}`}
                    </button>
                  )}
                  {domainState !== 'idle' && domainState !== 'connected' && (
                    <p className="text-meta font-medium text-danger" role="alert">
                      {domainState}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === 'share' && published && clicks && (
            <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Clicks">
              <p className="text-body-sm font-bold text-text">Clicks in the last 30 days</p>
              {clicks.length === 0 ? (
                <p className="text-meta text-muted">No one has pressed a Link card yet. Share your link to get started.</p>
              ) : (
                <ul className="space-y-1">
                  {clicks.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-3 text-meta">
                      <span className="min-w-0 truncate text-text">{c.label}</span>
                      <span className="shrink-0 font-semibold text-text">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'page' && upgrade && !readOnly && (
            <section className="space-y-2 rounded-card border border-border bg-surface p-4" aria-label="Selling cards">
              <p className="text-body-sm text-text">
                Product, Journey, event and membership cards come with Business. Book, Contact and Links are free.
              </p>
              {showUpgrade ? (
                <UpgradeMoment
                  surface="product"
                  target={upgrade.target}
                  offer={upgrade.offer}
                  onKeepFree={() => setShowUpgrade(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="text-meta font-medium text-primary-strong hover:underline"
                >
                  See what Business adds
                </button>
              )}
            </section>
          )}

          {tab === 'page' && seed && nodePath && (
            <NodeLinkListBuilder pageId={slug} loadRailData={loadRailData} seed={seed} paletteBlockIds={SPACE_SPOTLIGHT_BLOCK_IDS} />
          )}
          {tab === 'page' && seed && !nodePath && (
            <EntityPageBuilder
              pageId={slug}
              kind="space"
              loadRailData={loadRailData}
              seed={seed}
              paletteBlockIds={SPACE_SPOTLIGHT_BLOCK_IDS}
              maxColumns={1}
            />
          )}
        </div>

        <section aria-label="Preview" className={`min-w-0 lg:sticky lg:top-24 ${phoneView === 'edit' ? 'hidden lg:block' : ''}`}>
          <p className="eyebrow mb-2 text-center text-muted">Preview</p>
          <SpotlightPreviewFrame slug={slug}
            version={previewVersion}
            onPick={() => {
              setTab('page')
              setPhoneView('edit')
            }}
          />
        </section>
      </div>
  )

  return nodePath ? (
    <NodeLayoutProvider identity={`spotlight:${slug}`} save={saveNodes}>
      {body}
    </NodeLayoutProvider>
  ) : (
    <EntityLayoutProvider kind="space" save={save}>
      {body}
    </EntityLayoutProvider>
  )
}
