import Image from 'next/image'
import type { SpotlightBlock } from '@/lib/spotlight/blocks/schema'

// Server-side render of a validated Spotlight layout. CLOSED allowlist switch — a block
// type with no renderer produces nothing (never an echo of raw input). No
// dangerouslySetInnerHTML anywhere; all text goes through {value} (React auto-escapes).
// Inputs are already validated (lib/spotlight/blocks/validate.ts), but the renderer adds
// no trust of its own: links carry rel="nofollow", images come from the public bucket.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

function BlockView({ block }: { block: SpotlightBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 3 ? (
        <h3 className="mt-4 text-base font-bold text-text">{block.text}</h3>
      ) : (
        <h2 className="mt-6 text-lg font-bold text-text">{block.text}</h2>
      )
    case 'text':
      return <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-text">{block.text}</p>
    case 'links':
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block rounded-2xl border border-border-strong bg-surface px-4 py-3 text-center text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-elevated"
            >
              {item.label}
            </a>
          ))}
        </div>
      )
    case 'image':
      return (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Image
            src={`${PUBLIC_BASE}${block.assetPath}`}
            alt={block.alt}
            width={640}
            height={640}
            className="h-auto w-full object-cover"
          />
        </div>
      )
    case 'divider':
      return <hr className="my-2 border-border" />
    default:
      return null
  }
}

export function SpotlightBlocks({ blocks }: { blocks: SpotlightBlock[] }) {
  return (
    <div className="mt-6 space-y-4">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  )
}
