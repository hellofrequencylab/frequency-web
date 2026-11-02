'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, EyeOff, GripVertical, Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Toggle } from '@/components/admin/toggle'
import { PersonalAppearanceModule } from '@/components/admin/modules/personal-appearance-module'
import { resolveProfileSkin } from '@/lib/theme/profile-skins'
import { LinkInBioPage } from '@/components/spotlight/link-in-bio'
import { saveSpotlightPage } from '@/app/(main)/settings/profile/spotlight-page-actions'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'
import {
  LINK_ICONS,
  SOCIAL_KINDS,
  SOCIAL_LABEL,
  type LinkIcon,
  type PageLink,
  type PageSocial,
  type SocialKind,
  type SpotlightPageSettings,
} from '@/lib/spotlight/link-in-bio'
import type { SpotlightRow } from '@/lib/spotlight/privacy'

// THE "EDIT YOUR SPOTLIGHT" PAGE (personal). Tabs: Links, Profile, Frequency. The right column is the REAL public
// render (LinkInBioPage) fed from the editor's own state, so what you see is what a visitor gets. Edits stay local
// until "Save changes"; the live and publish switches write at once, like the rail card they replace.

type Tab = 'links' | 'profile' | 'look' | 'frequency'
const ICON_LABEL: Record<LinkIcon, string> = {
  link: 'Link', calendar: 'Calendar', mail: 'Mail', music: 'Music', video: 'Video', shop: 'Shop', book: 'Book', heart: 'Heart',
}

function newId() {
  return `l${Math.random().toString(36).slice(2, 10)}`
}

export function SpotlightPageEditor({
  profile,
  initial,
  maxLinks,
  enabled: enabledInitial,
  published: publishedInitial,
  clicks = {},
}: {
  profile: SpotlightRow
  initial: SpotlightPageSettings
  maxLinks: number | null
  enabled: boolean
  published: boolean
  /** Presses per link id over the last 30 days (LIVE-1954). */
  clicks?: Record<string, number>
}) {
  const [tab, setTab] = useState<Tab>('links')
  const [page, setPage] = useState<SpotlightPageSettings>({ ...initial, configured: true })
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [enabled, setEnabled] = useState(enabledInitial)
  const [published, setPublished] = useState(publishedInitial)
  const [skin, setSkin] = useState(profile.profile_theme)
  const [dragId, setDragId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function edit(next: SpotlightPageSettings) {
    setPage(next)
    setDirty(true)
    setMessage(null)
  }
  const patchLink = (id: string, patch: Partial<PageLink>) =>
    edit({ ...page, links: page.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  const move = (from: number, to: number) => {
    if (to < 0 || to >= page.links.length || from === to) return
    const links = [...page.links]
    const [item] = links.splice(from, 1)
    links.splice(to, 0, item)
    edit({ ...page, links })
  }
  // Leaving with unsaved edits loses them: ask the browser to confirm (LIVE-1956).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const [copied, setCopied] = useState(false)
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/spotlight/${profile.handle}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ kind: 'error', text: 'Could not copy. Your link is /spotlight/' + profile.handle })
    }
  }
  const totalClicks = page.links.reduce((n, l) => n + (clicks[l.id] ?? 0), 0)
  const atCap = maxLinks != null && page.links.length >= maxLinks

  function addLink() {
    if (atCap) return
    edit({ ...page, links: [...page.links, { id: newId(), title: '', url: 'https://', icon: 'link', hidden: false, highlight: false }] })
  }

  function save() {
    // The preview already shows what saves; links with no usable address are dropped by the server.
    start(async () => {
      const res = await saveSpotlightPage(page)
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else {
        if (res.saved) setPage(res.saved)
        setDirty(false)
        setMessage({ kind: 'ok', text: 'Saved.' })
      }
    })
  }

  function flip(kind: 'enabled' | 'published', next: boolean) {
    start(async () => {
      try {
        if (kind === 'enabled') {
          await setMySpotlightEnabled(next)
          setEnabled(next)
          if (!next) setPublished(false)
        } else {
          await setSpotlightPublished(next)
          setPublished(next)
        }
        setMessage(null)
      } catch (e) {
        setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update your Spotlight.' })
      }
    })
  }

  const setSocial = (kind: SocialKind, url: string) => {
    const rest = page.socials.filter((s) => s.kind !== kind)
    const socials: PageSocial[] = url.trim() ? [...rest, { kind, url }] : rest
    // Keep the row in the fixed network order so the preview does not jump around while typing.
    socials.sort((a, b) => SOCIAL_KINDS.indexOf(a.kind) - SOCIAL_KINDS.indexOf(b.kind))
    edit({ ...page, socials })
  }

  const previewPage: SpotlightPageSettings = {
    ...page,
    links: page.links.map((l) => ({ ...l, url: /^[a-z][a-z0-9+.-]*:/i.test(l.url) ? l.url : `https://${l.url}`, title: l.title || l.url.replace(/^https?:\/\//, '') })),
    socials: page.socials.map((s) => ({ ...s, url: s.kind === 'email' && !s.url.startsWith('mailto:') ? `mailto:${s.url}` : s.url })),
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="Spotlight sections"
            value={tab}
            onChange={setTab}
            segments={[
              { value: 'links', label: 'Links' },
              { value: 'profile', label: 'Profile' },
              { value: 'look', label: 'Look' },
              { value: 'frequency', label: 'Frequency' },
            ]}
          />
          <div className="flex items-center gap-2">
            {published && (
              <Button variant="ghost" size="sm" onClick={copyLink}>
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
            {published && (
              <Link href={`/spotlight/${profile.handle}`} target="_blank" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong hover:underline">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View your Spotlight
              </Link>
            )}
            <Button onClick={save} disabled={!dirty || pending}>
              {pending ? 'Saving' : 'Save changes'}
            </Button>
          </div>
        </div>
        {message && (
          <p role="status" className={`text-meta ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
            {message.text}
          </p>
        )}

        {tab === 'links' && (
          <section className="space-y-3" aria-label="Links">
            {totalClicks > 0 && (
              <p className="text-meta text-muted">
                {totalClicks} {totalClicks === 1 ? 'click' : 'clicks'} on your links in the last 30 days.
              </p>
            )}
            {page.links.length === 0 && (
              <p className="rounded-card border border-dashed border-border p-6 text-center text-body-sm text-muted">
                Add the first thing you want people to find. A booking page, a podcast, a shop.
              </p>
            )}
            <ul className="space-y-3">
              {page.links.map((l, i) => (
                <li
                  key={l.id}
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) move(page.links.findIndex((x) => x.id === dragId), i)
                    setDragId(null)
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={`rounded-card border border-border bg-surface p-3 ${l.hidden ? 'opacity-70' : ''} ${dragId === l.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-3 h-4 w-4 shrink-0 cursor-grab text-subtle" aria-hidden />
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`t-${l.id}`}>Title</Label>
                        <Input id={`t-${l.id}`} value={l.title} maxLength={60} placeholder="Book a session" onChange={(e) => patchLink(l.id, { title: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`u-${l.id}`}>Link</Label>
                        <Input id={`u-${l.id}`} value={l.url} inputMode="url" onChange={(e) => patchLink(l.id, { url: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-6">
                    <label className="sr-only" htmlFor={`i-${l.id}`}>Icon</label>
                    <Select
                      id={`i-${l.id}`}
                      wrapperClassName="inline-block w-max max-w-full"
                      value={l.icon}
                      onChange={(e) => patchLink(l.id, { icon: e.target.value as LinkIcon })}
                      options={LINK_ICONS.map((k) => ({ value: k, label: ICON_LABEL[k] }))}
                    />
                    <Button variant="ghost" size="sm" aria-label="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="ghost" size="sm" aria-label="Move down" onClick={() => move(i, i + 1)} disabled={i === page.links.length - 1}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                    <Button
                      variant={l.highlight ? 'primarySoft' : 'ghost'}
                      size="sm"
                      aria-pressed={l.highlight}
                      onClick={() => edit({ ...page, links: page.links.map((x) => ({ ...x, highlight: x.id === l.id ? !l.highlight : false })) })}
                    >
                      <Star className="h-4 w-4" aria-hidden /> {l.highlight ? 'Highlighted' : 'Highlight'}
                    </Button>
                    <span className="ml-auto inline-flex items-center gap-2 text-meta text-muted">
                      <span title="Presses in the last 30 days">{clicks[l.id] ?? 0} {(clicks[l.id] ?? 0) === 1 ? 'click' : 'clicks'}</span>
                      {l.hidden && <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                      <Toggle checked={!l.hidden} onChange={(on) => patchLink(l.id, { hidden: !on })} ariaLabel={`Show ${l.title || 'this link'} on your page`} />
                    </span>
                    <Button variant="ghost" size="sm" aria-label={`Delete ${l.title || 'link'}`} onClick={() => edit({ ...page, links: page.links.filter((x) => x.id !== l.id) })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <details className="mt-2 pl-6">
                    <summary className="cursor-pointer text-meta text-muted">Schedule</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`s-${l.id}`}>Show from</Label>
                        <Input id={`s-${l.id}`} type="datetime-local" value={toLocal(l.startsAt)} onChange={(e) => patchLink(l.id, { startsAt: fromLocal(e.target.value) })} />
                      </div>
                      <div>
                        <Label htmlFor={`e-${l.id}`}>Hide after</Label>
                        <Input id={`e-${l.id}`} type="datetime-local" value={toLocal(l.endsAt)} onChange={(e) => patchLink(l.id, { endsAt: fromLocal(e.target.value) })} />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={addLink} disabled={atCap}>
                <Plus className="h-4 w-4" aria-hidden /> Add link
              </Button>
              {maxLinks != null && (
                <span className="text-meta text-muted">
                  {page.links.length} of {maxLinks} used{atCap ? '. Crew adds more room.' : ''}
                </span>
              )}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section className="space-y-5" aria-label="Profile">
            <p className="text-body-sm text-muted">
              Your photo, name and bio come from your profile, so they stay the same everywhere.{' '}
              <Link href="/settings/profile" className="font-semibold text-primary-strong hover:underline">Edit your profile</Link>
            </p>
            <div className="space-y-3">
              <p className="text-body-sm font-semibold text-text">Find me online</p>
              {SOCIAL_KINDS.map((k) => (
                <div key={k}>
                  <Label htmlFor={`so-${k}`}>{SOCIAL_LABEL[k]}</Label>
                  <Input
                    id={`so-${k}`}
                    value={page.socials.find((s) => s.kind === k)?.url.replace(/^mailto:/, '') ?? ''}
                    inputMode={k === 'email' ? 'email' : 'url'}
                    placeholder={k === 'email' ? 'you@example.com' : 'https://'}
                    onChange={(e) => setSocial(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'look' && (
          <section className="space-y-3" aria-label="Look">
            <p className="text-body-sm text-muted">
              Your theme, fonts and background. Each choice saves as you make it, and the preview follows the theme.
            </p>
            <PersonalAppearanceModule onSkinChange={setSkin} />
          </section>
        )}

        {tab === 'frequency' && (
          <section className="space-y-4" aria-label="Frequency">
            <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-text">Show Frequency features</p>
                <p className="text-meta text-muted">
                  On adds your events, circles and guestbook under your links. Off is a clean link page. Your page always ends with a small link to Frequency.
                </p>
              </div>
              <Toggle checked={page.frequencyFeatures} onChange={(on) => edit({ ...page, frequencyFeatures: on })} ariaLabel="Show Frequency features" />
            </div>
            <div className="space-y-3 rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-text">Your Spotlight page is on</span>
                <Toggle checked={enabled} onChange={(on) => flip('enabled', on)} ariaLabel="Turn your Spotlight page on" disabled={pending} />
              </div>
              {enabled && (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-body-sm text-text">Published {published ? '' : <span className="text-subtle">(draft only)</span>}</span>
                  <Toggle checked={published} onChange={(on) => flip('published', on)} ariaLabel="Publish your Spotlight page" disabled={pending} />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Live preview">
        <p className="mb-2 text-meta font-semibold uppercase tracking-wide text-subtle">Live preview</p>
        <div data-skin={resolveProfileSkin(skin)} className="max-h-[78vh] overflow-y-auto rounded-card border border-border bg-canvas">
          <LinkInBioPage profile={profile} page={previewPage} preview>
            {page.frequencyFeatures ? (
              <div className="rounded-card border border-border bg-surface p-4 text-center text-meta text-muted">
                Your events, circles and guestbook show here.
              </div>
            ) : null}
          </LinkInBioPage>
        </div>
      </aside>
    </div>
  )
}

function toLocal(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocal(v: string): string | undefined {
  if (!v) return undefined
  const t = new Date(v)
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString()
}
