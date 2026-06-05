# Database backups

Point-in-time JSON snapshots taken before destructive data operations. Each file
is self-contained: `tables.<name>` holds the full rows for that table at export time.

| File | Date | Operation | Contents |
|------|------|-----------|----------|
| `posts_wipe_20260605.json` | 2026-06-05 | Full `posts` wipe (owner-requested fresh start) | 11 posts, 4 reactions, 0 mentions |

These are **data** snapshots, not schema. Schema lives in `supabase/migrations/`.

## Restoring

The JSON mirrors the table columns one-to-one, so a restore is a straight insert.
Order matters: insert top-level posts (`parent_id = null`) first, then replies,
then `post_reactions` (FK → `posts`). Example for the posts wipe:

```bash
# inspect first
node -e "const b=require('./posts_wipe_20260605.json'); console.dir(b.tables.posts, {depth:null})"
```

Then re-insert via the Supabase SQL editor / MCP, mapping each JSON object to an
`INSERT INTO posts (...) VALUES (...)`. The cascade-deleted `post_reactions` and
`post_mentions` are included so engagement state can be rebuilt too.
