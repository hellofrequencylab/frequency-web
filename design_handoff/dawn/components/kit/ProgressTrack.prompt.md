Progress, labelled honestly.

```jsx
<ProgressTrack label="Climbing to Adept" hint="1 Journey to go" value={2} total={3} />
<ProgressTrack label="Week 2 of 4" steps={4} value={2} accent="signal" />
```

- Use `steps` whenever the thing genuinely has steps (a Journey's weeks, the season's three Journeys). A bar for a bare percentage.
- The label must say what the number means. No naked "62%".
- Never pair with shame copy: a partial track is a normal state.
