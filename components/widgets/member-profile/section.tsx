// The anchor seam every member module-engine block renders inside, mirroring the space renderer's
// ModuleSection (components/widgets/space-profile/section.tsx): a <section id> the profile sub-nav can
// deep-link to. `scroll-mt-36` clears the global header on a jump; `empty:hidden` collapses the wrapper
// when the inner block renders nothing (honest-empty), so a hidden block never leaves a phantom gap.

export function MemberSection({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <section id={anchor} className="scroll-mt-36 empty:hidden">
      {children}
    </section>
  )
}
