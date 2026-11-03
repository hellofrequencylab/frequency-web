'use client'

// THE TUNE RAIL (BLD-105; spec docs/EDITOR-NEXT.md#bld-105). Draws whatever lib/builder/tune.ts projects for the
// selected section: layer 1 (the words and pictures, role slots first, with their limits) and layer 2 under More.
// It never names a block type: a new block or role shows up here with no change to this file. Every change goes
// to the same draft the canvas edits, so a canvas edit shows here at once and an edit here shows on the canvas.

import { useId, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { tuneProjection, type TuneField } from '@/lib/builder/tune'
import type { Config, Field } from '@/lib/page-editor/types'
import styles from './tune-rail.module.css'

const MORE_KEY = 'frequency.builder.tune.more.v1'

type Props = Record<string, unknown>
type Change = (key: string, value: unknown) => void

function readMore(): boolean {
  try { return window.localStorage.getItem(MORE_KEY) === '1' } catch { return false }
}

function Count({ value, limit }: { value: string; limit?: number }) {
  if (!limit) return null
  const over = value.length > limit
  return <small className={styles.count} data-over={over || undefined}>{value.length} / {limit}</small>
}

/** One plain input for a text or textarea field, with its slot limit as a counter (a guide, never a block). */
function Words({ id, kind, value, limit, onChange }: { id: string; kind: 'text' | 'textarea'; value: unknown; limit?: number; onChange: (v: string) => void }) {
  const text = typeof value === 'string' ? value : ''
  return <>
    {kind === 'text'
      ? <input id={id} className={styles.input} value={text} onChange={(e) => onChange(e.target.value)} />
      : <textarea id={id} className={styles.input} rows={3} value={text} onChange={(e) => onChange(e.target.value)} />}
    <Count value={text} limit={limit} />
  </>
}

function Choice({ id, field, value, onChange }: { id: string; field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const options = 'options' in field ? [...field.options] : []
  const at = options.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(value))
  return (
    <select id={id} className={styles.input} value={at < 0 ? '' : String(at)} onChange={(e) => onChange(options[Number(e.target.value)]?.value)}>
      {at < 0 && <option value="">Theme default</option>}
      {options.map((o, i) => <option key={i} value={String(i)}>{o.label}</option>)}
    </select>
  )
}

/** A list: plain strings (paragraphs, areas) or rows of sub-fields, with add and remove inside the slot's counts. */
function List({ id, tune, value, onChange }: { id: string; tune: TuneField; value: unknown; onChange: (v: unknown) => void }) {
  const items = Array.isArray(value) ? value : []
  const sub = tune.field.type === 'array' ? (tune.field.arrayFields as Record<string, Field>) : {}
  const plain = Object.keys(sub).length === 0
  const max = tune.max ?? Infinity
  const min = tune.min ?? 0
  const set = (i: number, next: unknown) => onChange(items.map((it, j) => (j === i ? next : it)))
  return (
    <div className={styles.list} role="group" aria-labelledby={`${id}-label`}>
      {items.map((item, i) => (
        <div key={i} className={styles.item}>
          {plain
            ? <Words id={`${id}-${i}`} kind="textarea" value={item} onChange={(v) => set(i, v)} />
            : Object.entries(sub).map(([key, f]) => {
              const row = (item ?? {}) as Props
              const fid = `${id}-${i}-${key}`
              return <label key={key} className={styles.sub} htmlFor={fid}><span>{f.label ?? key}</span>
                {f.type === 'select' || f.type === 'radio'
                  ? <Choice id={fid} field={f} value={row[key]} onChange={(v) => set(i, { ...row, [key]: v })} />
                  : f.type === 'custom'
                    ? f.render({ field: f, name: key, id: fid, value: row[key], onChange: (v: unknown) => set(i, { ...row, [key]: v }) })
                    : <Words id={fid} kind={f.type === 'textarea' ? 'textarea' : 'text'} value={row[key]} onChange={(v) => set(i, { ...row, [key]: v })} />}
              </label>
            })}
          <button type="button" className={styles.icon} aria-label={`Remove item ${i + 1}`} disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}><Minus size={14} aria-hidden /></button>
        </div>
      ))}
      <button type="button" className={styles.add} disabled={items.length >= max} onClick={() => onChange([...items, plain ? '' : {}])}><Plus size={14} aria-hidden />Add{Number.isFinite(max) ? ` (${items.length} of ${max})` : ''}</button>
    </div>
  )
}

function Row({ tune, props, onChange }: { tune: TuneField; props: Props; onChange: Change }) {
  const id = `tune-${useId().replace(/:/g, '')}-${tune.key}`
  const value = props[tune.key]
  const set = (v: unknown) => onChange(tune.key, v)
  let control: ReactNode
  switch (tune.kind) {
    case 'text': case 'textarea': control = <Words id={id} kind={tune.kind} value={value} limit={tune.limit} onChange={set} />; break
    case 'choice': control = <Choice id={id} field={tune.field} value={value} onChange={set} />; break
    case 'number': control = <input id={id} className={styles.input} type="number" value={typeof value === 'number' ? value : ''} onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))} />; break
    case 'list': control = <List id={id} tune={tune} value={value} onChange={set} />; break
    case 'custom': control = tune.field.type === 'custom' ? tune.field.render({ field: tune.field, name: tune.key, id, value, onChange: set }) : null; break
  }
  return (
    <div className={styles.field}>
      <label id={`${id}-label`} htmlFor={id} className={styles.fieldLabel}>{tune.label}{tune.required && <span className={styles.req} aria-label="needed">·</span>}</label>
      {control}
    </div>
  )
}

export function TuneRail({ type, props, config, onChange }: { type: string; props: Props; config: Config; onChange: Change }) {
  const projection = tuneProjection(type, config)
  // The builder renders on the client only (ssr: false), so the stored choice can seed the state directly.
  const [alwaysMore, setAlwaysMore] = useState(readMore)
  const [more, setMore] = useState(alwaysMore)
  const keepMore = (on: boolean) => {
    setAlwaysMore(on)
    if (on) setMore(true)
    try { window.localStorage.setItem(MORE_KEY, on ? '1' : '0') } catch { /* private mode: this visit only */ }
  }
  return (
    <div className={styles.tune}>
      {projection.layer1.map((tune) => <Row key={tune.key} tune={tune} props={props} onChange={onChange} />)}
      {projection.layer2.length > 0 && <>
        <button type="button" className={styles.more} aria-expanded={more} onClick={() => setMore(!more)}>More · {projection.layer2.length}</button>
        {more && <div className={styles.layer2}>
          {projection.layer2.map((tune) => <Row key={tune.key} tune={tune} props={props} onChange={onChange} />)}
          <label className={styles.always}><input type="checkbox" checked={alwaysMore} onChange={(e) => keepMore(e.target.checked)} />Always show more</label>
        </div>}
      </>}
    </div>
  )
}
