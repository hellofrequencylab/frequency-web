import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE TIP JAR BLOCK (public Spotlight only; the in-app profile has the real composer), ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const tipBlock = defineBlock({
  type: 'tip',
  v: 1,
  kinds: ['member'],
  reads: 'live',
  content: contentFromFields('tip'),
  fields: fieldsForBlock('tip'),
  migrations: [],
  surfaces: {
    'spotlight-public': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/tip.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'tip'),
})
