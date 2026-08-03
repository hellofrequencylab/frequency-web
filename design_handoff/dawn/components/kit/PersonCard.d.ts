import * as React from 'react'

/** A member as a distinct object. For a directory list, prefer RowCard with an avatar. */
export interface PersonCardProps {
  /** A rendered Avatar element. */
  avatar?: React.ReactNode
  name: React.ReactNode
  handle?: string
  /** Only leadership roles and the system voice carry a chip. */
  role?: 'Host' | 'Guide' | 'Mentor' | 'Moderator' | 'Janitor' | 'Admin'
  line?: React.ReactNode
  /** A rendered RankBadge. */
  rank?: React.ReactNode
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function PersonCard(props: PersonCardProps): JSX.Element
