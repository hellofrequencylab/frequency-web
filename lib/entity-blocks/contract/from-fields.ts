import { z } from 'zod'
import { fieldsForBlock, inlineHtmlToText, type FieldDef } from '../block-content'

// THE SHARED SHAPE OF AN ADOPTED REGISTRY BLOCK (E1). A block whose stored content is a flat bag of the
// inspector's own fields states its content model once, here, from those fields, so the schema and the
// inspector cannot name different keys. A block with a richer model writes its schema by hand instead.
// Every value is optional: the editor stores a sparse bag and an empty block renders nothing.

const MAX_TEXT = 2000
const MAX_ITEMS = 48

function zodFor(field: FieldDef): z.ZodTypeAny {
  switch (field.type) {
    case 'toggle':
      return z.boolean().optional()
    case 'links':
    case 'images':
    case 'features':
    case 'cards':
    case 'picker':
      return z.array(z.unknown()).max(MAX_ITEMS).optional()
    case 'product':
    case 'event':
    case 'circle':
      return z.record(z.string(), z.unknown()).optional()
    default:
      return z.string().max(MAX_TEXT).optional()
  }
}

/** The Zod object for a registry block's flat field bag. */
export function contentFromFields(id: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fieldsForBlock(id)) shape[f.key] = zodFor(f)
  return z.object(shape)
}

const ROW_TEXT_KEYS = ['label', 'title', 'name', 'text', 'alt', 'body'] as const

/** The block as plain text: every written string field (tags dropped), and the written strings of a
 *  repeater's rows, one per line. Links, ids and switches never read as text. */
export function textOfContent(content: Record<string, unknown>, id: string): string {
  const out: string[] = []
  for (const f of fieldsForBlock(id)) {
    const v = content[f.key]
    if (typeof v === 'string' && (f.type === 'text' || f.type === 'textarea')) {
      const t = inlineHtmlToText(v).replace(/\s*\n\s*/g, ' ')
      if (t) out.push(t)
    } else if (
      Array.isArray(v) &&
      (f.type === 'links' || f.type === 'images' || f.type === 'features' || f.type === 'cards')
    ) {
      for (const row of v) {
        if (!row || typeof row !== 'object') continue
        for (const k of ROW_TEXT_KEYS) {
          const rv = (row as Record<string, unknown>)[k]
          if (typeof rv === 'string' && rv.trim()) out.push(inlineHtmlToText(rv).replace(/\s*\n\s*/g, ' '))
        }
      }
    }
  }
  return out.join('\n')
}
