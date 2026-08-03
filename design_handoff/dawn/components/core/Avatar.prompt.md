A round member avatar with a warm initials fallback (amber background, primary-strong text) and an optional teal "online now" dot.

```jsx
<Avatar name="Maya Ortiz" src={url} size={44} online />
<Avatar name="Leo Park" size={32} />
```

- `size` is the diameter in px (44 default for cards, 32 for feed rows).
- Falls back to initials when `src` is omitted; the dot uses the brand teal success color.
