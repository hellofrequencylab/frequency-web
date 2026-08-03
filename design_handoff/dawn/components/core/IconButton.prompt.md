A compact icon-only control for reactions, kebab menus, and toolbar actions. Quiet by default with a warm hover wash; `active` lights it in a tone.

```jsx
<IconButton label="Like" tone="danger" active={liked} onClick={toggle}>
  <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
</IconButton>
<IconButton label="More"><MoreHorizontal size={16} /></IconButton>
```

- Always pass `label` (accessible name + tooltip). Keep `size` ≥ 36 for touch targets.
- `tone` sets the active color: `neutral` (amber), `danger` (liked heart), `signal`, `broadcast`.
