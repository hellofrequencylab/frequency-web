'use client'

import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { FieldForm, type FieldsSchema, type PushRequest } from '@/components/page-editor/mobile/field-form'
import type { Config, ContentItem, Data, Metadata } from '@/lib/page-editor/types'
import { isServiceListed, type SpaceOffering } from '@/lib/spaces/profile-data'
import { normalizeWebsiteFields } from '@/lib/sites/website-fields'
import { useWebsiteFeatureSource } from './feature-source-context'
import { sectionDeviceLayout, sectionLayoutPreset, SECTION_SPACING_STEPS, snapSectionSpacing } from '@/lib/sites/editor/layout'
import { resolveWebsiteChrome, validWebsiteChrome, type WebsiteChrome, type Device, type SectionDisplay } from '@/lib/sites/editor/state'

export function WebsiteInspector({ config, block, doc, device, metadata, sourceSettingsHref, onChange, onDisplay }: {
  config: Config; block: ContentItem; doc: Data; device: Device; metadata?: Metadata; sourceSettingsHref?: string
  onChange: (props: Record<string, unknown>) => void; onDisplay: (value: SectionDisplay | null) => void
}) {
  const [screens, setScreens] = useState<PushRequest[]>([])
  const editableProps = normalizeWebsiteFields(block).props
  const { load, error: sourceError } = useWebsiteFeatureSource()
  const schema = config.components[block.type]?.fields ?? {}
  // Match SpaceOfferings' canonical catalog precedence, including its listed-only public filter.
  const centralOfferings: SpaceOffering[] = block.type === 'SpaceOfferings' && Array.isArray(metadata?.space?.profile?.offerings) ? metadata.space.profile.offerings : []
  const catalogOfferings = centralOfferings.length > 0
  const shownOfferings = centralOfferings.filter((item) => isServiceListed(item) && (item.title || item.blurb))
  const liveFeatures = block.type === 'FeatureGrid' && ['offerings', 'events', 'memberships', 'tickets'].includes(String(block.props.source))
  useEffect(() => {
    if (liveFeatures && typeof block.props.id === 'string') void load(block.props.id, String(block.props.source))
  }, [liveFeatures, block.props.id, block.props.source, load])
  const fields = Object.fromEntries(Object.entries(schema).filter(([key, f]) => f.type !== 'slot' && f.type !== 'external' && !((liveFeatures || catalogOfferings) && key === 'items')).map(([key, field]) => [key, field.type === 'array' ? { ...field, getItemSummary: (item: unknown, index: number) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const title = [row.title, row.name].find((value) => typeof value === 'string' && value.trim())
    return typeof title === 'string' ? title.trim() : field.getItemSummary?.(item, index) || `Item ${index + 1}`
  } } : field])) as FieldsSchema
  const hasExternalSource = Object.values(schema).some((field) => field.type === 'external')
  const sub = screens.at(-1)
  const path = screens.flatMap((screen) => screen.path ?? [])
  const nestedValue = path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, editableProps)
  const changeNested = (value: Record<string, unknown>) => {
    if (!sub?.path) { sub?.onChange(value); return }
    if (!nestedValue || typeof nestedValue !== 'object') { setScreens([]); return }
    const next = structuredClone(editableProps)
    let parent: Record<string | number, unknown> = next
    for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>
    parent[path.at(-1)!] = value
    onChange(next)
  }
  const display = sectionDeviceLayout(doc, block.props.id!, device)
  const live = /^(SpaceEvents|LiveEvents|SpaceCommunity|CirclesGrid|SpacePractices|SpaceFAQ)$/.test(block.type) || liveFeatures
  return <>
    {block.type === 'FeatureGrid' && <label className="we-field">Content source<Select wrapperClassName="!contents [&>svg]:hidden" style={{ appearance: 'auto', minHeight: 0, boxShadow: 'none', transition: 'none' }} value={liveFeatures ? String(block.props.source) : 'custom'} onChange={(e) => onChange({ ...block.props, source: e.target.value })}><option value="custom">Authored cards</option><option value="offerings">Space offerings</option><option value="events">Space events</option><option value="memberships">Space memberships</option><option value="tickets">Space tickets</option></Select></label>}
    {liveFeatures && sourceError && <p className="we-note" role="alert">{sourceError}</p>}
    {catalogOfferings && <div className="we-proposal"><strong>Live Space offerings</strong><p>These cards come from your Space’s services catalog. Edit titles, details and prices there; this section controls their presentation.</p><ul>{shownOfferings.map((item, index) => <li key={index}>{item.title || item.blurb}</li>)}</ul>{shownOfferings.length === 0 && <p>No listed offerings are visible.</p>}{sourceSettingsHref && <a className="we-row" href={sourceSettingsHref} target="_blank" rel="noreferrer">Edit Space offerings</a>}</div>}
    {hasExternalSource && <div className="we-proposal"><strong>Connected content</strong><p>This content is managed in your Space. Website controls change its presentation.</p>{sourceSettingsHref && <a className="we-row" href={sourceSettingsHref} target="_blank" rel="noreferrer">Edit source content</a>}</div>}
    {live && <div className="we-proposal"><strong>Live from your Space</strong><p>Published dates and listings update automatically. These fields control how they appear here.</p></div>}
    {sub && <button type="button" className="we-row" onClick={() => setScreens((s) => s.slice(0, -1))}><ChevronLeft size={16} />{sub.title}</button>}
    <FieldForm fields={sub?.fields ?? fields} value={sub ? (sub.path && nestedValue && typeof nestedValue === 'object' ? nestedValue as Record<string, unknown> : sub.value) : editableProps} onChange={sub ? changeNested : onChange} onPushScreen={(s) => setScreens((stack) => [...stack, s])} />
    {block.type === 'Zigzag' && <div className="we-field"><span>Layout</span><div className="we-actions">{(['left', 'right', 'stacked'] as const).map((preset) => <button type="button" className="we-action secondary" key={preset} aria-pressed={preset === 'stacked' ? display.columns === 1 : display.columns !== 1 && (editableProps.mediaSide ?? 'left') === preset} onClick={() => { const next = sectionLayoutPreset(editableProps, display, preset); onChange(next.props); onDisplay(next.display) }}>{preset === 'left' ? 'Photo left' : preset === 'right' ? 'Photo right' : 'Stacked'}</button>)}</div></div>}
    <details className="we-drawer" open><summary>Spacing</summary>
      <label className="we-field">Column gap <span>{display.gap === undefined ? 'Theme default' : `${display.gap}px`}</span><Input variant="seamless" aria-label="Column gap" type="range" min={0} max={96} step={4} value={display.gap ?? 0} onChange={(e) => onDisplay({ ...display, gap: Number(e.target.value) })} /></label>
      <label className="we-field">Space above and below <span>{display.padding === undefined ? 'Theme default' : `${display.padding}px`}</span><Input variant="seamless" aria-label="Section spacing" type="range" min={0} max={SECTION_SPACING_STEPS.length - 1} step={1} value={Math.max(0, SECTION_SPACING_STEPS.findIndex((step) => step === snapSectionSpacing(display.padding ?? 0)))} onChange={(e) => onDisplay({ ...display, padding: SECTION_SPACING_STEPS[Number(e.target.value)] })} /></label>
      <button type="button" className="we-row" onClick={() => onDisplay({ ...display, padding: undefined, gap: undefined })}>Use theme spacing</button>
    </details>
    <details className="we-drawer"><summary>Breakpoints</summary><div className="we-note">{device === 'desktop' ? 'Desktop is the base layout. Tablet and phone inherit it.' : `You are editing ${device} only. Unchanged values inherit the desktop layout.`}</div>
      <label className="we-field">Columns<Select wrapperClassName="!contents [&>svg]:hidden" style={{ appearance: 'auto', minHeight: 0, boxShadow: 'none', transition: 'none' }} value={display.columns ?? ''} onChange={(e) => onDisplay({ ...display, columns: e.target.value ? Number(e.target.value) : undefined })}><option value="">Theme default</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>
      <label className="we-field">Heading size <span>{display.textSize ?? 0}px · 0 uses theme</span><Input variant="seamless" aria-label="Heading size" type="range" min={0} max={120} step={2} value={display.textSize ?? 0} onChange={(e) => onDisplay({ ...display, textSize: Number(e.target.value) })} /></label>
      <label className="we-field">Text alignment<Select wrapperClassName="!contents [&>svg]:hidden" style={{ appearance: 'auto', minHeight: 0, boxShadow: 'none', transition: 'none' }} value={display.align ?? ''} onChange={(e) => onDisplay({ ...display, align: e.target.value ? e.target.value as 'left' | 'center' | 'right' : undefined })}><option value="">Theme default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></Select></label>
      {device !== 'desktop'  && <button type="button" className="we-row" onClick={() => onDisplay(null)}>Reset {device} overrides</button>}
    </details>
    <details className="we-drawer"><summary>Animation</summary><label className="we-field">Reveal on scroll<Select wrapperClassName="!contents [&>svg]:hidden" style={{ appearance: 'auto', minHeight: 0, boxShadow: 'none', transition: 'none' }} value={display.animation ?? 'none'} onChange={(e) => onDisplay({ ...display, animation: e.target.value as 'none' | 'fade' | 'rise' })}><option value="none">None</option><option value="fade">Fade in</option><option value="rise">Rise in</option></Select></label></details>
    <details className="we-drawer"><summary>Custom code</summary><label className="we-field">Class name<Input variant="seamless" value={display.className ?? ''} onChange={(e) => onDisplay({ ...display, className: e.target.value })} placeholder="my-section" /></label><label className="we-field">Data attributes<Input variant="seamless" value={display.attributes ?? ''} onChange={(e) => onDisplay({ ...display, attributes: e.target.value })} placeholder="data-campaign=autumn" /></label><p className="we-note">Theme classes and data attributes apply to this section.</p></details>
    <details className="we-drawer"><summary>Visibility</summary><label className="we-field"><span><Input variant="seamless" type="checkbox" style={{ width: 'auto' }} checked={display.hidden ?? false} onChange={(e) => onDisplay({ ...display, hidden: e.target.checked })} /> Hide on {device === 'desktop' ? 'all devices' : device}</span></label></details>
  </>
}


function ChromeTextField({ label, value, maxLength, onCommit }: { label: string; value: string; maxLength: number; onCommit: (value: string) => boolean }) {
  const [buffer, setBuffer] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const commit = () => {
    if (buffer === null) return
    if (onCommit(buffer)) { setBuffer(null); setError(false) } else setError(true)
  }
  return <label className="we-field">{label}<Input variant="seamless" aria-label={label} aria-invalid={error || undefined} maxLength={maxLength} value={buffer ?? value} onChange={(event) => { setBuffer(event.target.value); setError(false) }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { setBuffer(null); setError(false) } }} />{error && <span role="alert">{label === 'Header button link' ? 'Use a website path, #anchor or HTTPS address.' : 'Enter a name or button label.'}</span>}</label>
}

/** Global website chrome edits stay in the website draft; linked live sources remain authoritative. */
export function WebsiteChromeInspector({ area, chrome, defaults, sourceSettingsHref, onChange, onTheme, onPages, onMenu }: {
  area: 'header' | 'footer'; chrome?: WebsiteChrome
  defaults: { name: string; tagline: string | null; cta: { label: string; href: string } | null }
  sourceSettingsHref?: string; onChange: (value: WebsiteChrome) => void
  onTheme: () => void; onPages: () => void
  /** Opens the shared menu and logo editor (components/spaces/site-menu-editor.tsx). */
  onMenu?: () => void
}) {
  const value = resolveWebsiteChrome({ chrome }, defaults)
  const commit = (next: WebsiteChrome) => { if (!validWebsiteChrome(next)) return false; onChange(next); return true }
  const reset = (key: keyof WebsiteChrome) => { const next = { ...chrome }; delete next[key]; onChange(next) }
  return <>
    <p className="we-note">Changes apply to the {area} across every website page.</p>
    <ChromeTextField label="Website name" maxLength={100} value={value.name} onCommit={(name) => commit({ ...chrome, name })} />
    {chrome?.name !== undefined && <button type="button" className="we-row" onClick={() => reset('name')}>Use Space name</button>}
    {area === 'header' ? <>
      {onMenu && <button type="button" className="we-row" onClick={onMenu}>Edit menu and logo</button>}
      <button type="button" className="we-row" onClick={onTheme}>Edit logo and brand colors</button>
      <div className="we-field"><span>Header button</span><label><Input variant="seamless" type="checkbox" aria-label="Show header button" checked={value.cta !== null} onChange={(e) => onChange({ ...chrome, cta: e.target.checked ? defaults.cta ?? { label: 'Contact', href: '/contact' } : null })} /> Show button</label></div>
      {value.cta && <>
        <ChromeTextField label="Header button label" maxLength={80} value={value.cta.label} onCommit={(label) => commit({ ...chrome, cta: { ...value.cta!, label } })} />
        <ChromeTextField label="Header button link" maxLength={2000} value={value.cta.href} onCommit={(href) => commit({ ...chrome, cta: { ...value.cta!, href } })} />
      </>}
      {chrome && Object.prototype.hasOwnProperty.call(chrome, 'cta') && <button type="button" className="we-row" onClick={() => reset('cta')}>Use Space header button</button>}
    </> : <>
      <label className="we-field">Footer tagline<Input variant="seamless" aria-label="Footer tagline" maxLength={500} value={value.tagline ?? ''} onChange={(e) => onChange({ ...chrome, tagline: e.target.value || null })} /></label>
      {chrome && Object.prototype.hasOwnProperty.call(chrome, 'tagline') && <button type="button" className="we-row" onClick={() => reset('tagline')}>Use Space tagline</button>}
      <p className="we-note">The copyright year updates automatically. The Frequency Partner link identifies your website provider.</p>
    </>}
    <button type="button" className="we-row" onClick={onPages}>Edit page navigation</button>
    <div className="we-proposal"><strong>Live from your Space</strong><p>The seasonal strip, next event and authorized admin links use their original sources.</p>{sourceSettingsHref && <a className="we-row" href={sourceSettingsHref} target="_blank" rel="noreferrer">Open Space settings</a>}</div>
  </>
}
