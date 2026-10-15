// Next 16.4 strict route matching needs a fallback for this group's implicit children slot
// when the wizard closer is matched beside a page in another root route group.
// Actual unmatched URLs remain owned by [...catchAll]/page.tsx and its routing-time 404.
export default function MainChildrenDefault() {
  return null
}
