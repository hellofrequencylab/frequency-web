// THE INSPECTOR'S FIELD LIST, SERVER SIDE (PROG-E5). The block contract and its registry stay on the server: the
// route reads the contract's fields for one surface (inspectorFields) and hands the client a plain, serializable
// view of each control it can draw. Rich fields (lists, galleries, cards, pickers) keep their own editors and are
// counted, not drawn, so the inspector never shows a control it cannot save. Two flags ride the word fields (item 4):
// `image` on a single image field (a URL or a library reference; the inspector draws it), and `rich` on long text a
// block stores as inline markup (the inspector shows its words and formatting, never the markup).

import { primitiveValues } from '@/lib/entity-blocks/block-content'
import { inspectorFields } from './inspector-model'

type InspectorBlock = Parameters<typeof inspectorFields>[0]
type InspectorSurface = Parameters<typeof inspectorFields>[1]

export type InspectorFieldView =
  | { key: string; label: string; kind: 'text' | 'url' | 'textarea'; placeholder?: string; image?: true; rich?: true }
  | { key: string; label: string; kind: 'toggle'; defaultValue: boolean }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[]; defaultValue: string }

const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** The fields one surface edits, as controls the client inspector can draw, plus how many it left to other editors. */
export function inspectorFieldViews(
  block: InspectorBlock,
  surface: InspectorSurface,
): { fields: InspectorFieldView[]; elsewhere: number } {
  const fields: InspectorFieldView[] = []
  let elsewhere = 0
  for (const field of inspectorFields(block, surface)) {
    const { key, label, placeholder } = field
    if (field.type === 'text' || field.type === 'url' || field.type === 'textarea') {
      fields.push({
        key, label, kind: field.type, ...(placeholder ? { placeholder } : {}),
        ...(field.type === 'url' && field.upload ? { image: true as const } : {}),
      })
      continue
    }
    if (field.type === 'toggle') {
      fields.push({ key, label, kind: 'toggle', defaultValue: field.default ?? false })
      continue
    }
    const values = primitiveValues(field)
    if (values && values.length > 0) {
      const labelled = new Map(field.options?.map((option) => [option.value, option.label]))
      fields.push({
        key,
        label,
        kind: 'choice',
        options: values.map((value) => ({ value, label: labelled.get(value) ?? sentence(value) })),
        defaultValue: field.defaultValue ?? values[0]!,
      })
      continue
    }
    elsewhere += 1
  }
  return { fields, elsewhere }
}

/** The same views with every long text field marked rich, for a block that stores its long text as inline markup
 *  (a content block: sanitizeBlockContent runs sanitizeInlineHtml on it at every save). */
export function withRichText(fields: readonly InspectorFieldView[]): InspectorFieldView[] {
  return fields.map((field) => (field.kind === 'textarea' ? { ...field, rich: true as const } : field))
}
