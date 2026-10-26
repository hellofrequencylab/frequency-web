import '@/app/themes/active/members-a'


/** The Frequency Feed's loading face: the centre column's own shapes (greeting, the four standing
 *  numbers, the glass panel, the Up next card, three posts between hairlines), quiet and still, so the
 *  real column lands in the same places. The shell's rails are already painted by the layout. */
function FrequencyFeedLoading() {
  return (
    <div className="fa-col fa-loading" aria-busy="true" aria-label="Loading your feed">
      <span className="fa-sk" style={{ width: 220, height: 14 }} />
      <span className="fa-sk" style={{ width: '62%', height: 44, marginTop: 14 }} />
      <span className="fa-sk" style={{ width: '44%', height: 16, marginTop: 14 }} />
      <div className="fa-stats">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="fa-sk" style={{ width: 96, height: 56 }} />
        ))}
      </div>
      <span className="fa-sk fa-sk-panel" style={{ height: 180, marginTop: 22 }} />
      <span className="fa-sk fa-sk-panel" style={{ height: 300, marginTop: 44 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="fa-post">
          <span className="fa-sk" style={{ width: 200, height: 14 }} />
          <span className="fa-sk" style={{ width: '100%', height: 14 }} />
          <span className="fa-sk" style={{ width: '70%', height: 14 }} />
        </div>
      ))}
    </div>
  )
}

export default function FeedLoading() {
  return <FrequencyFeedLoading />
}
