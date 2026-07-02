// TEAM — the people who run this space. GAP (S2): the shared content data bag carries no team roster
// (the live Puck SpaceTeam block is operator-authored inline props, not a live read), so there is
// nothing to render from data alone. FAIL-SAFE by construction: this block renders nothing until a
// team data source lands in getSpaceContentData. Kept as a registered block so the id maps and the
// layout order is preserved (a zero-arg component is assignable to the block signature).
export function TeamBlock() {
  return null
}
