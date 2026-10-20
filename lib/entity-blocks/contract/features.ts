import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE FEATURES BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const featuresBlock = defineBlock({
  type: 'features',
  v: 1,
  kinds: ['space', 'email'],
  reads: 'authored',
  content: contentFromFields('features'),
  fields: fieldsForBlock('features'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/features.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'features'),
})
