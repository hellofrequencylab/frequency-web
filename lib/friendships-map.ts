// View-model bucketing for the friends list, split out of the page so it's a
// plain (testable) function. Rows come from the `my_friendships` SECURITY DEFINER
// RPC (migration 20240305000000).

export type FriendshipRpcRow = {
  friendship_id: string
  status: string
  i_requested: boolean
  requested_at: string
  other_id: string
  other_display_name: string | null
  other_handle: string | null
  other_avatar_url: string | null
}

export type FriendEntry = {
  id: string // friendship id
  other: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

function toEntry(r: FriendshipRpcRow): FriendEntry {
  return {
    id: r.friendship_id,
    other: {
      id: r.other_id,
      display_name: r.other_display_name ?? '',
      handle: r.other_handle ?? '',
      avatar_url: r.other_avatar_url,
    },
  }
}

// Split friendships into incoming requests, outgoing requests, and accepted
// friends. Incoming = pending and the other party requested; outgoing = pending
// and I requested.
export function bucketFriendships(rows: FriendshipRpcRow[]): {
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
  accepted: FriendEntry[]
} {
  const incoming: FriendEntry[] = []
  const outgoing: FriendEntry[] = []
  const accepted: FriendEntry[] = []
  for (const r of rows) {
    if (r.status === 'accepted') accepted.push(toEntry(r))
    else if (r.status === 'pending') (r.i_requested ? outgoing : incoming).push(toEntry(r))
  }
  return { incoming, outgoing, accepted }
}
