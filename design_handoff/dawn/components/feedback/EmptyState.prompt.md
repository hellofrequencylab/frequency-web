A warm, encouraging empty surface — icon chip, title, one line of guidance, and an optional CTA. Never a cold "No data"; always point to the next human action.

```jsx
<EmptyState
  icon={<Users size={24} />}
  title="No circles near you yet"
  action={<Button href="/discover/circles">Find a circle</Button>}
>
  Pick an interest and we'll show you the small groups practicing nearby.
</EmptyState>
```
