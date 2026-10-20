import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE ZIGZAG BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const zigzagBlock = defineBlock({
  type: 'zigzag',
  v: 1,
  kinds: ['space'],
  reads: 'authored',
  content: contentFromFields('zigzag'),
  fields: fieldsForBlock('zigzag'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/zigzag.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'zigzag'),
})
