One item in a list. Use this, not a card per row.

```jsx
<RowCard date={{ mon: 'Aug', day: 6 }} accent="signal"
  title="Breathe Connect Expand" meta="Encinitas Viewpoint Park" trailing="6:30p" />
<RowCard avatar={<Avatar name="Leo Park" size={32} />} title="Leo Park" meta="@leopark · Movement" trailing="2mi" />
```

- Set `onClick` and the row picks up a white hover wash; leave it off for a static read.
- `divider={false}` on the last row of a group.
