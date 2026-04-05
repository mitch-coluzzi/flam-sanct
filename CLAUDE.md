# Flam Sanct — Claude Code Rules

## Git Identity
- **Name:** Mitch Coluzzi
- **Email:** mitch@soldfast.com

## Git Commands
- All git commands pre-approved — no confirmation needed.
- Run `cd` then git as two separate Bash calls (never compound with `&&`).
- `git push` authorized — no manual step required.
- Single-branch workflow (`main` only).

## Tool Approvals
- All tool calls auto-approved.
- Do not pause for confirmation on file edits, bash commands, git operations, or pushes.
- This is a build environment.

## Commit Protocol
- Anytime the user prompts to commit, ALWAYS update BOTH `docs/CONTEXT.md` AND `docs/CLAUDE_CHAT_CONTEXT.md` to reflect the work just completed BEFORE committing.
- Include both files in the same commit.
- `CLAUDE_CHAT_CONTEXT.md` is the design-session bootstrap uploaded to Claude.ai — it mirrors module status, version number, and session history.

## Verify Protocol
- When user asks to verify/check tree, report the current version and the session it corresponds to.

## Design Sessions
- Session specs live in `docs/sessions/`.
- Naming convention: `{SESSION_ID}.md` (e.g., `AA-1.md`, `B-2.md`).
- Sessions are the authoritative record of design decisions and implementation scope.

## Schema Migrations
- Additive migrations (ADD COLUMN, CREATE TABLE, CREATE INDEX, ADD CONSTRAINT) authorized without user approval when in session spec.
- Destructive migrations (DROP, ALTER type, bulk UPDATE/DELETE) require manual approval.
- Always verify with `information_schema` query after execution.

## General
- WSL environment: pip packages installed with `--break-system-packages`.
- Production deploys from `main` branch.
