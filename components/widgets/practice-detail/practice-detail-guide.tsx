import { getDetailPractice } from '@/lib/practices/detail-data'
import { HelpMarkdown } from '@/components/help/help-markdown'

// Practice-detail layout module: the full write-up (Why it works / How to do it / In The Quest),
// rendered from the practice body markdown.
export async function PracticeDetailGuide() {
  const practice = await getDetailPractice()
  if (!practice?.body) return null
  return <HelpMarkdown>{practice.body}</HelpMarkdown>
}
