import { getDetailPractice } from '@/lib/practices/detail-data'

// Practice-detail layout module: the practice's tags.
export async function PracticeDetailTags() {
  const practice = await getDetailPractice()
  if (!practice || practice.tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
      {practice.tags.map((t) => (
        <span key={t.slug} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">
          #{t.label}
        </span>
      ))}
    </div>
  )
}
