'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Lock, Plus, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Field, Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import {
  getSiteMenuEditorData,
  resetSiteMenu,
  saveHeaderLogo,
  saveSiteMenu,
  type MenuEditorData,
  type MenuEditorOption,
} from '@/app/(main)/spaces/[slug]/manage/layout/menu-actions'
import { uploadSpaceImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  isMenuHref,
  MAX_MENU_CHILDREN,
  MAX_MENU_ITEMS,
  type HeaderLogoMode,
  type MenuChild,
  type MenuItem,
  type MenuTarget,
  type MenuVisibility,
  type SiteMenu,
} from '@/lib/spaces/site-menu'

// THE MENU EDITOR (lib/spaces/site-menu.ts). One component, mounted in the Space console's Page settings
// and in the website editor's header settings, editing the ONE menu and header logo both platforms
// read. It loads its own data (getSiteMenuEditorData re-gates the caller), so any surface can drop it
// in with just the Space slug.
//
// A Free Space sees its automatic menu, locked, with the Business note. The logo choice is open to
// every plan.

const VISIBILITY: { value: MenuVisibility; label: string }[] = [
  { value: 'both', label: 'Space page and website' },
  { value: 'space', label: 'Space page only' },
  { value: 'website', label: 'Website only' },
]

const LOGO_MODES: { value: HeaderLogoMode; label: string; hint: string }[] = [
  { value: 'image_name', label: 'Image and name', hint: 'Your Space image in a circle, beside your name.' },
  { value: 'name', label: 'Name only', hint: 'Just your name. The image is turned off.' },
  { value: 'logo', label: 'Logo', hint: 'An uploaded logo on its own, never cropped. Great for wordmarks.' },
]

const CUSTOM = '__url'
const newId = () => `m${Date.now().toString(36)}${Math.round(Math.random() * 1e4).toString(36)}`

export function SiteMenuEditor({ slug, className }: { slug: string; className?: string }) {
  const [data, setData] = useState<MenuEditorData | null | undefined>(undefined)
  const [menu, setMenu] = useState<SiteMenu | null>(null)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let live = true
    getSiteMenuEditorData(slug)
      .then((d) => {
        if (!live) return
        setData(d)
        setMenu(d?.menu ?? null)
      })
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [slug])

  if (data === undefined) return <p className="text-body-sm text-muted">Loading your menu…</p>
  if (!data || !menu) return null

  const update = (items: MenuItem[]) => {
    setMenu({ ...menu, items })
    setDirty(true)
    setMessage(null)
  }
  const patch = (i: number, next: Partial<MenuItem>) => update(menu.items.map((it, j) => (j === i ? { ...it, ...next } : it)))
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= menu.items.length) return
    const items = [...menu.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    update(items)
  }
  const invalid = menu.items.some((it) => !it.label.trim() || !targetsValid(it))

  const save = () =>
    start(async () => {
      const r = await saveSiteMenu(slug, menu)
      if (!('error' in r)) {
        setDirty(false)
        setData({ ...data, saved: true })
        setMessage({ tone: 'ok', text: 'Saved. Your Space page and website now share this menu.' })
      } else setMessage({ tone: 'error', text: r.error })
    })
  const reset = () =>
    start(async () => {
      const r = await resetSiteMenu(slug)
      if ('error' in r) return setMessage({ tone: 'error', text: r.error })
      const fresh = await getSiteMenuEditorData(slug)
      setData(fresh)
      setMenu(fresh?.menu ?? null)
      setDirty(false)
      setMessage({ tone: 'ok', text: 'Back to the automatic menu.' })
    })

  return (
    <div className={cn('space-y-8', className)}>
      <LogoSection slug={slug} data={data} onSaved={(logo) => setData({ ...data, logo })} />

      <section className="space-y-4" aria-labelledby="site-menu-heading">
        <div>
          <h3 id="site-menu-heading" className="text-body font-semibold text-text">
            Menu
          </h3>
          <p className="text-body-sm text-muted">
            {data.hasWebsite
              ? 'One menu for your Space page and your website. Edit it here or in the other one and both stay in sync.'
              : 'The menu across the top of your Space page. When you publish a website, it uses this menu too.'}
          </p>
        </div>

        {!data.canEdit && (
          <p className="flex items-start gap-2 rounded-card bg-surface-elevated px-4 py-3 text-body-sm text-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Your menu builds itself from your pages and the features you turn on. Reordering, custom links and dropdowns come
            with the Business plan.
          </p>
        )}

        <ol className="space-y-3">
          {menu.items.map((item, i) => (
            <MenuItemRow
              key={item.id}
              item={item}
              options={data.options}
              readOnly={!data.canEdit}
              first={i === 0}
              last={i === menu.items.length - 1}
              onChange={(next) => patch(i, next)}
              onMove={(by) => move(i, by)}
              onRemove={() => update(menu.items.filter((_, j) => j !== i))}
            />
          ))}
        </ol>

        {data.canEdit && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={menu.items.length >= MAX_MENU_ITEMS}
                onClick={() => update([...menu.items, { id: newId(), label: 'New link', visibility: 'both', target: { kind: 'url', href: 'https://' } }])}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add a link
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={menu.items.length >= MAX_MENU_ITEMS}
                onClick={() =>
                  update([
                    ...menu.items,
                    { id: newId(), label: 'New dropdown', visibility: 'both', children: [{ label: data.options[0]?.label ?? 'Home', target: { kind: 'auto', key: data.options[0]?.key ?? 'home' } }] },
                  ])
                }
              >
                <ChevronDown className="h-4 w-4" aria-hidden /> Add a dropdown
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button onClick={save} disabled={pending || invalid || (!dirty && data.saved)}>
                {data.saved ? 'Save menu' : 'Save as my menu'}
              </Button>
              {data.saved && (
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  Use the automatic menu
                </Button>
              )}
              {invalid && <span className="text-meta text-danger">Give every item a name and a working link.</span>}
              {message && (
                <span role="status" className={cn('text-meta', message.tone === 'ok' ? 'text-success' : 'text-danger')}>
                  {message.text}
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function targetsValid(it: MenuItem): boolean {
  const ok = (t: MenuTarget | undefined) => !!t && (t.kind === 'auto' || isMenuHref(t.href))
  if (it.children) return it.children.length > 0 && it.children.every((c) => c.label.trim() && ok(c.target)) && (!it.feature || (!!it.feature.title.trim() && ok(it.feature.target)))
  return ok(it.target)
}

function MenuItemRow({
  item,
  options,
  readOnly,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: MenuItem
  options: MenuEditorOption[]
  readOnly: boolean
  first: boolean
  last: boolean
  onChange: (next: Partial<MenuItem>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const isDropdown = !!item.children
  return (
    <li className="space-y-3 rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isDropdown ? 'Dropdown name' : 'Name'} className="min-w-40 flex-1">
          <Input value={item.label} maxLength={60} disabled={readOnly} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        {!isDropdown && (
          <TargetPicker label="Links to" target={item.target} options={options} disabled={readOnly} onChange={(target) => onChange({ target })} />
        )}
        <Field label="Shows on" className="min-w-44">
          <Select
            value={item.visibility}
            disabled={readOnly}
            onChange={(e) => onChange({ visibility: e.target.value as MenuVisibility })}
            options={VISIBILITY}
          />
        </Field>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <IconButton variant="bordered" label={`Move ${item.label} up`} disabled={first} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton variant="bordered" label={`Move ${item.label} down`} disabled={last} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton variant="bordered" label={`Remove ${item.label}`} onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        )}
      </div>
      {isDropdown && <DropdownFields item={item} options={options} readOnly={readOnly} onChange={onChange} />}
    </li>
  )
}

function DropdownFields({
  item,
  options,
  readOnly,
  onChange,
}: {
  item: MenuItem
  options: MenuEditorOption[]
  readOnly: boolean
  onChange: (next: Partial<MenuItem>) => void
}) {
  const children = item.children ?? []
  const setChild = (i: number, next: Partial<MenuChild>) => onChange({ children: children.map((c, j) => (j === i ? { ...c, ...next } : c)) })
  return (
    <div className="space-y-3 border-l-2 border-border pl-4">
      <p className={labelClasses}>Links in this dropdown</p>
      {children.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <Field label="Name" className="min-w-36 flex-1">
            <Input value={c.label} maxLength={60} disabled={readOnly} onChange={(e) => setChild(i, { label: e.target.value })} />
          </Field>
          <Field label="Short description" className="min-w-48 flex-[2]">
            <Input value={c.desc ?? ''} maxLength={160} disabled={readOnly} onChange={(e) => setChild(i, { desc: e.target.value || undefined })} />
          </Field>
          <TargetPicker label="Links to" target={c.target} options={options} disabled={readOnly} onChange={(target) => setChild(i, { target })} />
          {!readOnly && children.length > 1 && (
            <IconButton variant="bordered" label={`Remove ${c.label}`} onClick={() => onChange({ children: children.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
        </div>
      ))}
      {!readOnly && children.length < MAX_MENU_CHILDREN && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ children: [...children, { label: 'New link', target: { kind: 'auto', key: options[0]?.key ?? 'home' } }] })}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a link to this dropdown
        </Button>
      )}

      <div className="space-y-3 pt-2">
        <label className="flex items-center gap-2 text-body-sm text-text">
          <input
            type="checkbox"
            checked={!!item.feature}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ feature: e.target.checked ? { title: item.label, target: children[0]?.target ?? { kind: 'auto', key: 'home' } } : undefined })
            }
          />
          Show a photo card beside the links
        </label>
        {item.feature && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Card title" className="min-w-40 flex-1">
              <Input value={item.feature.title} maxLength={60} disabled={readOnly} onChange={(e) => onChange({ feature: { ...item.feature!, title: e.target.value } })} />
            </Field>
            <Field label="Card description" className="min-w-48 flex-[2]">
              <Input
                value={item.feature.desc ?? ''}
                maxLength={160}
                disabled={readOnly}
                onChange={(e) => onChange({ feature: { ...item.feature!, desc: e.target.value || undefined } })}
              />
            </Field>
            <TargetPicker
              label="Card links to"
              target={item.feature.target}
              options={options}
              disabled={readOnly}
              onChange={(target) => onChange({ feature: { ...item.feature!, target } })}
            />
            <Field label="Photo address (https)" className="min-w-56 flex-[2]">
              <Input
                value={item.feature.img ?? ''}
                maxLength={2000}
                disabled={readOnly}
                placeholder="https://"
                onChange={(e) => onChange({ feature: { ...item.feature!, img: e.target.value || undefined } })}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

function TargetPicker({
  label,
  target,
  options,
  disabled,
  onChange,
}: {
  label: string
  target: MenuTarget | undefined
  options: MenuEditorOption[]
  disabled: boolean
  onChange: (t: MenuTarget) => void
}) {
  const value = target?.kind === 'auto' ? target.key : CUSTOM
  const groups: MenuEditorOption['group'][] = ['Pages', 'Features', 'Home sections']
  const where = (o: MenuEditorOption) => (o.on === 'space' ? ' (Space page)' : o.on === 'website' ? ' (website)' : '')
  const known = target?.kind !== 'auto' || options.some((o) => o.key === target.key)
  return (
    // `contents`: the picker and its address join the row's own wrap, so they sit beside the other fields.
    <div className="contents">
      <Field label={label} className="min-w-52 flex-1">
        <Select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === CUSTOM ? { kind: 'url', href: target?.kind === 'url' ? target.href : 'https://' } : { kind: 'auto', key: e.target.value })}
        >
          {groups.map((g) => {
            const list = options.filter((o) => o.group === g)
            return list.length ? (
              <optgroup key={g} label={g}>
                {list.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {where(o)}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
          {!known && target?.kind === 'auto' && <option value={target.key}>Not available right now</option>}
          <option value={CUSTOM}>Custom link…</option>
        </Select>
      </Field>
      {target?.kind === 'url' && (
        <Field label="Address" className="min-w-52 flex-1" error={target.href && !isMenuHref(target.href) ? 'Use https://, mailto:, tel:, a /path or a #section.' : undefined}>
          <Input
            value={target.href}
            maxLength={2000}
            disabled={disabled}
            aria-invalid={!isMenuHref(target.href) || undefined}
            onChange={(e) => onChange({ kind: 'url', href: e.target.value.trim() })}
          />
        </Field>
      )}
    </div>
  )
}

function LogoSection({ slug, data, onSaved }: { slug: string; data: MenuEditorData; onSaved: (logo: MenuEditorData['logo']) => void }) {
  const [mode, setMode] = useState<HeaderLogoMode>(data.logo.mode)
  const [logoUrl, setLogoUrl] = useState<string | null>(data.logo.logoUrl)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const persist = (nextMode: HeaderLogoMode, nextUrl: string | null) =>
    start(async () => {
      const r = await saveHeaderLogo(slug, { mode: nextMode, logoUrl: nextUrl })
      if (!('error' in r)) {
        onSaved({ mode: nextMode, logoUrl: nextUrl })
        setNote({ tone: 'ok', text: 'Logo saved on your Space page and website.' })
      } else setNote({ tone: 'error', text: r.error })
    })

  const upload = (file: File) =>
    start(async () => {
      const fd = new FormData()
      fd.set('file', file)
      const r = await uploadSpaceImage(slug, 'logo', fd)
      if ('error' in r) return setNote({ tone: 'error', text: r.error })
      setLogoUrl(r.url)
      setMode('logo')
      const saved = await saveHeaderLogo(slug, { mode: 'logo', logoUrl: r.url })
      if (!('error' in saved)) {
        onSaved({ mode: 'logo', logoUrl: r.url })
        setNote({ tone: 'ok', text: 'Logo uploaded and in use.' })
      } else setNote({ tone: 'error', text: saved.error })
    })

  return (
    <section className="space-y-3" aria-labelledby="site-logo-heading">
      <div>
        <h3 id="site-logo-heading" className="text-body font-semibold text-text">
          Logo
        </h3>
        <p className="text-body-sm text-muted">How your name shows in the menu bar, on your Space page and your website.</p>
      </div>
      <div role="radiogroup" aria-labelledby="site-logo-heading" className="grid gap-2 sm:grid-cols-3">
        {LOGO_MODES.map((m) => {
          const disabled = pending || (m.value === 'logo' && !logoUrl)
          return (
            <label
              key={m.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-card border p-3 transition-colors',
                mode === m.value ? 'border-primary bg-primary-bg' : 'border-border bg-surface hover:bg-surface-elevated',
                disabled && mode !== m.value && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-text">
                <input
                  type="radio"
                  name={`logo-mode-${slug}`}
                  value={m.value}
                  checked={mode === m.value}
                  disabled={disabled}
                  onChange={() => {
                    setMode(m.value)
                    persist(m.value, logoUrl)
                  }}
                />
                {m.label}
              </span>
              <span className="text-meta text-muted">{m.value === 'logo' && !logoUrl ? 'Upload a logo to use this.' : m.hint}</span>
            </label>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <LogoPreview mode={mode} image={data.image} logoUrl={logoUrl} name={data.brandName} />
        <label className={cn('inline-flex cursor-pointer items-center gap-2 text-body-sm font-medium text-primary-strong', pending && 'pointer-events-none opacity-60')}>
          <Upload className="h-4 w-4" aria-hidden />
          {logoUrl ? 'Upload a different logo' : 'Upload a logo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
        </label>
        {note && (
          <span role="status" className={cn('text-meta', note.tone === 'ok' ? 'text-success' : 'text-danger')}>
            {note.text}
          </span>
        )}
      </div>
    </section>
  )
}

function LogoPreview({ mode, image, logoUrl, name }: { mode: HeaderLogoMode; image: string | null; logoUrl: string | null; name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-pill bg-surface-elevated px-3 py-2" aria-label="Preview">
      {mode === 'logo' && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator upload on an arbitrary host
        <img src={logoUrl} alt={name} className="h-8 w-auto max-w-40 object-contain" />
      ) : (
        <>
          {mode === 'image_name' && image && (
            // eslint-disable-next-line @next/next/no-img-element -- operator upload on an arbitrary host
            <img src={image} alt="" className="h-8 w-8 rounded-full object-cover" />
          )}
          <span className="font-display text-body-lg text-text">{name}</span>
        </>
      )}
    </div>
  )
}
