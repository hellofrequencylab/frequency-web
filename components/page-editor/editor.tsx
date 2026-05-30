'use client'

import { Puck, type Data } from '@measured/puck'
import '@measured/puck/puck.css'
import Link from 'next/link'
import { config } from '@/lib/page-editor/config'
import { publishPage } from '@/app/edit/actions'

// Full-screen Puck editor for a marketing page. Admin-only (the editor runtime
// only loads here; the public site never ships it). "Publish" saves + goes live.
export function PageEditor({ slug, title, data }: { slug: string; title: string; data: Data }) {
  return (
    <Puck
      config={config}
      data={data}
      headerTitle={`Editing: ${title}`}
      onPublish={async (d) => {
        await publishPage(slug, d)
      }}
      overrides={{
        headerActions: ({ children }) => (
          <>
            <Link
              href="/studio/pages"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-[#555] hover:text-black"
            >
              ← Exit
            </Link>
            {children}
          </>
        ),
      }}
    />
  )
}
