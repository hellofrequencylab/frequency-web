The in-app season-rank pill for The Quest. Maps a rank to the earthy rank spectrum and renders the `.rank-badge` primitive (a dot + label) that adapts to light and dark.

```jsx
<RankBadge rank="ghost" />
<RankBadge rank="adept" showStep />
<RankBadge rank="master">Master · season 1</RankBadge>
```

- Season ranks are completion-based, not points-based: **Ghost** (0 Journeys) → **Initiate** (1) → **Adept** (2) → **Master** (3, plus the Certificate).
- Ghost is a real status with a real badge. Never style it as a failure or an empty state.
- `showStep` appends the honest read ("2/3"). Use it on the Quest home, not in a feed row.
- Any spectrum color name (stone, clay, gold, olive, jade, teal, slate, indigo, plum, rose) also works for Pillar dots and Space accents.
