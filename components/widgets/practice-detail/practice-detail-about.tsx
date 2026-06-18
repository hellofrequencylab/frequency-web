import { getDetailPractice } from '@/lib/practices/detail-data'

// Practice-detail layout module: the plain-language intro, shown only when the description adds
// something beyond the subtitle hook already in the header.
export async function PracticeDetailAbout() {
  const practice = await getDetailPractice()
  if (!practice) return null
  const hook = practice.summary ?? practice.description
  if (!practice.description || practice.description === hook) return null
  return <p className="text-base leading-relaxed text-muted">{practice.description}</p>
}
