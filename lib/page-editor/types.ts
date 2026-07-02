// ─────────────────────────────────────────────────────────────────────────────
// Page-document types — the LOCAL, dependency-free definition of the Puck-format
// document model the whole app is built on.
//
// Historically these were re-exported straight from `@measured/puck`. That package
// has been removed (ADR-493 Phase 2): the read path renders through the in-house
// BlockRender (lib/page-editor/block-render.tsx) and the editor is the in-house
// desktop/mobile core (components/page-editor/*). Nothing imports the Puck runtime
// anymore, so the type surface it used to lend is defined here instead.
//
// These are a faithful, minimal port of the shapes actually used across the repo
// (verified against Puck 0.20.2 node_modules/@measured/puck/dist/walk-tree-*.d.ts):
// the block registry (`Config` / `ComponentConfig` / `Fields` / `Field`), the
// serialized document (`Data`), and the render channel (`Metadata`). The generics
// Puck layered on top (per-component prop inference) are intentionally dropped —
// no code in this repo used them (every registry is `Record<string, ComponentConfig>`
// and every doc is a plain `Data`), so plain object types are both correct and far
// easier to keep. The persisted `{ content, root }` shape is UNCHANGED, so no stored
// document migrates.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactElement, ReactNode } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Arbitrary render metadata threaded through the tree (dynamic + Space + Spotlight
 *  blocks read it — e.g. `metadata.live`, `metadata.space`, `metadata.spotlight`).
 *  `any`-valued (as Puck's was) so blocks read their own keys without casts. */
export type Metadata = { [key: string]: any }

/** A block's resolved props. Deliberately open (`any`-valued, matching Puck): blocks
 *  read their own keys, and generic tree code manipulates props without narrowing. */
export type DefaultComponentProps = { [key: string]: any }

// ── Field model ──────────────────────────────────────────────────────────────
// The field kinds a block declares in its `fields` schema, mirrored from Puck's
// discriminated `Field` union (self-contained; the editor's field-form renders
// each kind, block-render walks the `slot` kind).

export type FieldOption = {
  label: string
  value: string | number | boolean | undefined | null | object
}
type FieldOptions = ReadonlyArray<FieldOption> | Array<FieldOption>

type BaseField = {
  label?: string
  labelIcon?: ReactElement
  metadata?: Metadata
  visible?: boolean
}

export type TextField = BaseField & {
  type: 'text'
  placeholder?: string
  contentEditable?: boolean
}
export type TextareaField = BaseField & {
  type: 'textarea'
  placeholder?: string
  contentEditable?: boolean
}
export type NumberField = BaseField & {
  type: 'number'
  placeholder?: string
  min?: number
  max?: number
  step?: number
}
export type SelectField = BaseField & {
  type: 'select'
  options: FieldOptions
}
export type RadioField = BaseField & {
  type: 'radio'
  options: FieldOptions
}
export type ArrayField = BaseField & {
  type: 'array'
  arrayFields: Fields<any>
  defaultItemProps?: DefaultComponentProps
  getItemSummary?: (item: any, index?: number) => string
  max?: number
  min?: number
}
export type ObjectField = BaseField & {
  type: 'object'
  objectFields: Fields<any>
}
export type CustomFieldRenderProps<Value = unknown> = {
  field: CustomField
  name: string
  id: string
  value: Value
  onChange: (value: Value) => void
  readOnly?: boolean
}
export type CustomField = BaseField & {
  type: 'custom'
  render: (props: CustomFieldRenderProps<any>) => ReactNode
  contentEditable?: boolean
}
export type SlotField = BaseField & {
  type: 'slot'
  allow?: string[]
  disallow?: string[]
}
export type ExternalField = BaseField & {
  type: 'external'
  placeholder?: string
  fetchList: (params: { query: string; filters: Record<string, any> }) => Promise<any[] | null>
  mapProp?: (value: any) => any
  getItemSummary?: (item: any, index?: number) => string
}

/** Any field kind a block may declare. */
export type Field =
  | TextField
  | TextareaField
  | NumberField
  | SelectField
  | RadioField
  | ArrayField
  | ObjectField
  | CustomField
  | SlotField
  | ExternalField

/** A block's field schema: one `Field` per editable prop. */
export type Fields<Props extends DefaultComponentProps = DefaultComponentProps> = {
  [PropName in keyof Props]: Field
}

// ── Block registry ───────────────────────────────────────────────────────────

/** One block definition: how it renders + its editable field schema + defaults. */
export type ComponentConfig<Props extends DefaultComponentProps = DefaultComponentProps> = {
  render: (props: any) => ReactNode
  label?: string
  defaultProps?: Props
  fields?: Fields<Props>
  inline?: boolean
  metadata?: Metadata
}

/** The root wrapper config (renders once, wraps the content zone as `children`). */
export type RootConfig = {
  render?: (props: any) => ReactNode
  fields?: Fields
  defaultProps?: DefaultComponentProps
  label?: string
}

/** A left-bar grouping of block types. */
export type Category<ComponentName extends string = string> = {
  components?: ComponentName[]
  title?: string
  visible?: boolean
  defaultExpanded?: boolean
}

/** The whole block library: components + optional root + left-bar categories. */
export type Config = {
  components: { [componentName: string]: ComponentConfig }
  root?: RootConfig
  categories?: Record<string, Category>
}

// ── Serialized document ──────────────────────────────────────────────────────

/** One stored block: `{ type, props }` where `props.id` is the stable per-item key.
 *  `props` may also carry `slot`-typed props (nested `ContentItem[]` arrays). `id` is
 *  typed optional so generic tree code can rebuild `props` without re-proving it (it
 *  is always present at runtime — makeItem stamps it, convert.ts asserts it). */
export type ContentItem = {
  type: string
  props: DefaultComponentProps & { id?: string }
  readOnly?: Partial<Record<string, boolean>>
}

/** The root node's stored data: either `{ props: {...} }` or the props laid flat. */
export type RootData = {
  props?: DefaultComponentProps
  readOnly?: Partial<Record<string, boolean>>
  [key: string]: unknown
}

/** The persisted page document. Shape is FROZEN (byte-for-byte) so no stored doc
 *  migrates: marketing `pages.data`/`published_data`, Space `preferences.pageDocs`,
 *  and the Spotlight bridge (lib/spotlight/puck/convert.ts) all read/write this. */
export type Data = {
  root: RootData
  content: ContentItem[]
  zones?: Record<string, ContentItem[]>
}
