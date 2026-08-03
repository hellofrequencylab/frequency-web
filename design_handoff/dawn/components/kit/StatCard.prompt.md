The operator number tile (Dashboard template).

```jsx
<StatCard label="Weekly active members" value="212" delta="+8%" direction="up" spark={[8,12,9,15,14,18,22]} hint="Practised at least once this week" />
```

- **Operator only.** A member page shows Zaps, Gems, Streak and season rank through `Stat` / `RankBadge` and nothing else.
- Values use the mono face at weight 500 so a wall of numbers reads tabular, not shouty.
- Green only ever appears here as a delta, never in marketing chrome.
