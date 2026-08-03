How the product tells the truth about something that is built but not on.

```jsx
<GateNotice kind="preview" title="Billing turns on at graduation"
  action={<Button size="sm" disabled>Start a subscription</Button>}>
  Memberships are free through September 1. This is the real screen, the button just does not charge anybody yet.
</GateNotice>

<GateNotice kind="dormant" inline title="Needs a key" />
```

- Leave the surface **browsable underneath**. A dormant capability is never a blank pane or a lock icon.
- Say what happens when it turns on, and when. Never "coming soon" with no date and no reason.
- `preview` pairs with a genuinely disabled control, so nobody discovers the inertness by clicking.
- Never dress a gate as an upsell. The paywall is caps and take-rate, not locks.
