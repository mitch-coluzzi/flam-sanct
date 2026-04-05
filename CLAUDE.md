# FlamSanct — Claude Code Rules

## Git Identity
- **Name:** Mitch Coluzzi
- **Email:** mitch@soldfast.com

## Git Commands
- All git commands pre-approved — no confirmation needed.
- Run `cd` then git as two separate Bash calls (never compound with `&&`).
- `git push` authorized — no manual step required.
- Single-branch workflow (`main` only).
- Commit message format: `[FS-{spec}] description` e.g. `[FS-2] Add workout logging endpoint`

## Tool Approvals
- All tool calls auto-approved.
- Do not pause for confirmation on file edits, bash commands, git operations, or pushes.
- This is a build environment.

## Commit Protocol
- Anytime the user prompts to commit, ALWAYS update BOTH `docs/CONTEXT.md` AND `docs/CLAUDE_CHAT_CONTEXT.md` to reflect the work just completed BEFORE committing.
- Include both files in the same commit.
- `CLAUDE_CHAT_CONTEXT.md` is the design-session bootstrap uploaded to Claude.ai — it mirrors module status, version number, and session history.

## Verify Protocol
- When user asks to verify/check tree, report the current platform version and the session it corresponds to.

## Design Sessions & Specs
- Session specs live in `docs/sessions/`.
- Spec naming: `FS-{N}-{TITLE}.md` (e.g., `FS-0-ARCHITECTURE.md`, `FS-2-DAILY-LOOP.md`).
- Specs are the authoritative record of design decisions and implementation scope.

## Schema Migrations
- Additive migrations (ADD COLUMN, CREATE TABLE, CREATE INDEX, ADD CONSTRAINT) authorized without user approval when in session spec.
- Destructive migrations (DROP, ALTER type, bulk UPDATE/DELETE) require manual approval.
- Always verify with `information_schema` query after execution.
- All tables have RLS enabled. Admin operations use service role key.
- All deletes are soft deletes (`deleted_at = now()`). No hard deletes.
- All primary keys are UUIDs (`gen_random_uuid()`).

## Auth Rules
- Never use the Supabase anon key for backend operations. Always use the service role key on the API.
- Store tokens in `expo-secure-store`, never AsyncStorage.
- Every FastAPI route that touches user data must use `Depends(get_current_user)`.

## Claude API Rules
- All Claude calls live in `api/services/claude.py`. No inline calls in routers.
- Always use `claude-sonnet-4-6`.
- Always set `max_tokens` explicitly.
- Log every call to `ai_feedback_requests` table (user_id, type, tokens_used).
- Rate limit on-demand queries: 10 per member per day.

## Calorie Burn
- Compute on workout save, not on read.
- Store result in `workouts.estimated_calories_burned`.
- Use MET values from FS-0 §8.

## Realtime
- Subscribe to channels in a `useRealtime` hook. Unsubscribe on unmount.
- Never create duplicate channel subscriptions.
- Channel names: `conversation:{id}`, `community:feed`, `directives:{chef_id}`, `photo_affirm:{member_id}`

## Expo
- Use Expo Router for all navigation. File-based routing under `app/`.
- Use `expo-secure-store` for all token storage.
- Use `expo-image-picker` for photo capture.
- All bottom sheets use `@gorhom/bottom-sheet`.
- State management: Zustand for global auth state and user profile. React Query for server state.

## Daily Logs
- Every write to `daily_logs` goes through the PATCH endpoint — never direct Supabase client writes from the app for this table.

## General
- WSL environment: pip packages installed with `--break-system-packages`.
- Production: Railway auto-deploys from `main` branch.
