import { loadPolls } from '@/lib/feed/polls'
import { PollBlock } from './poll-block'

// A poll post's options (LIVE-682), read on its own and streamed behind the card's Suspense, so a
// poll never adds a wave to the feed's critical path (components/feed/feed-waves.test.ts pins that).
// Polls are a small share of any stream, so one read per poll on screen is the cheaper trade.
export async function PostPoll({ postId, myProfileId }: { postId: string; myProfileId: string | null }) {
  const poll = (await loadPolls([postId], myProfileId)).get(postId)
  if (!poll) return null
  return <PollBlock postId={postId} poll={poll} canVote={!!myProfileId} />
}
