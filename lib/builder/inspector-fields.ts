// THE INSPECTOR'S FIELD LIST, SERVER SIDE (PROG-E5). The block contract and its registry stay on the server: the
// route reads the contract's fields for one surface (inspectorFields) and hands the client a plain, serializable
// view of each control it can draw. Rich fields (lists, images, cards, pickers) keep their own editors and are
// counted, not drawn, so the inspector never shows a control it cannot save.

import { primitiveValues } from '@/lib/entity-blocks/block-content'
import { inspectorFields } from './inspector-model'

type InspectorBlock = Parameters<typeof inspectorFields>[0]
type InspectorSurface = Parameters<typeof inspectorFields>[1]

export type InspectorFieldView =
  | { key: string; label: string; kind: 'text' | 'url' | 'textarea'; placeholder?: string }
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
      fields.push({ key, label, kind: field.type, ...(placeholder ? { placeholder } : {}) })
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
