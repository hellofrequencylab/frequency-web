// Feed is an authenticated page wrapped by app/(main)/layout.tsx.
// The nav shell, auth check, and profile fetch all happen in the layout —
// this page only needs to render its content.
export default function FeedPage() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Feed</h1>
      <p className="text-sm text-gray-500">Posts will appear here.</p>
    </div>
  )
}
