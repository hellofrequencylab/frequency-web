// The anchor seam every module-engine section renders inside, matching the live Puck blocks'
// AnchorSection (components/page-editor/blocks/profile.tsx): a <section id> the profile sub-nav can
// deep-link to. `scroll-mt-36` clears the global header + the sticky profile menu on a jump;
// `empty:hidden` collapses the wrapper when the inner block renders nothing (honest-empty), so a
// hidden section never leaves a phantom gap in the stack.

export function ModuleSection({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <section id={anchor} className="scroll-mt-36 empty:hidden">
      {children}
    </section>
  )
}
