import { z } from 'zod'
import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'

// THE DIVIDER BLOCK, ADOPTED (E1 pilot). It has no content, so its schema is the empty object and its
// field list is empty; the bijection `check:blocks` holds is trivially true, which is the point of
// piloting it beside a block that has a field.
export const dividerBlock = defineBlock({
  type: 'divider',
  v: 1,
  kinds: ['member', 'space', 'email'],
  reads: 'authored',
  content: z.object({}),
  fields: fieldsForBlock('divider'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: [] },
    'spotlight-public': { density: 'standard', fields: [] },
    'space-profile': { density: 'standard', fields: [] },
    'space-site': { density: 'standard', fields: [] },
    email: { density: 'standard', fields: [] },
  },
  render: { web: () => import('@/components/entity-blocks/blocks/divider.web'), email: 'registered' },
  toText: () => '',
})
