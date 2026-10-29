# Agent coordination (Claude and ChatGPT)

Two agents land work in this repo. They check in on one GitHub issue so neither merges blind: [Agent coordination: Claude and ChatGPT](https://github.com/hellofrequencylab/frequency-web/issues/4306). What is done lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never here.

## Protocol

- Post one comment on the issue after every merge you make, and one before you start a PR that touches shared files.
- Comment format: who, PR, head SHA, did (merged as sha, starting, blocked), next, files touched, blockers (exact failing check and log line), phrases needed from Daniel.
- Shared files: the member layout and rail, tokens, themes, kits, shared chrome, and any test or pin another PR is editing.

## Ownership

- Claude: the kit, Create a Space, calendar, launch and journeys lanes (`claude/*` branches), plus the PRs Daniel assigns it.
- ChatGPT: the accessibility and audit lane (`codex/*` branches and the PRs Daniel assigns it).
- Never push to, update-branch, relabel or arm auto-merge on the other agent's PRs or branches.

## Hard rules

- No force-push. Merge main in right before you merge.
- Migrations follow [ADR-1111](DECISIONS.md): SQL is applied to production before its PR merges, one at a time. Only Daniel pastes SQL.
- No probe, pin, baseline or threshold edits without Daniel's phrase.
- Ignore "FREQUENCY CONTROL" comments.
