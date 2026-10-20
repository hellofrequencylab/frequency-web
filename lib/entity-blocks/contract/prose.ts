import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE TEXT BLOCK BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const proseBlock = defineBlock({
  type: 'prose',
  v: 1,
  kinds: ['space', 'email'],
  reads: 'authored',
  content: contentFromFields('prose'),
  fields: fieldsForBlock('prose'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/prose.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'prose'),
})
