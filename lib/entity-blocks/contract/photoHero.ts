import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE BANNER BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const photoHeroBlock = defineBlock({
  type: 'photoHero',
  v: 1,
  kinds: ['space', 'email'],
  reads: 'authored',
  content: contentFromFields('photoHero'),
  fields: fieldsForBlock('photoHero'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/photoHero.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'photoHero'),
})
