# FS-7 — Community
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1

---

## 1. Overview

Community has two distinct surfaces:
1. **Feed** — async, public-to-all-members, post/react/reply
2. **Messages** — real-time DMs between any two participants (member↔member, member↔chef)

Leaderboards are Phase 2. The schema is built. The UI is not rendered at MVP — a placeholder tab is acceptable.

---

## 2. Feed API Endpoints

**GET /v1/community/feed**  
Paginated feed of community posts, newest first.  
Role: any authenticated user.  
Query: `?limit=20&cursor={id}`  
Returns posts with author display name, avatar, reaction count, reply count, linked workout/benchmark if any.

**POST /v1/community/posts**  
Create a community post.  
Role: member.  
Body:
```json
{
  "body": "Shield lock at The Forge this morning. 14 PAX. Nobody quit.",
  "image_url": null,
  "linked_workout_id": "uuid",
  "linked_benchmark_id": null
}
```

**DELETE /v1/community/posts/{id}**  
Soft delete. Author or admin only.

**POST /v1/community/posts/{id}/react**  
Toggle a reaction on a post. If already reacted, removes it.  
Body: `{ "reaction": "flam" }` — "flam" is the only reaction at MVP (FlamSanct's native equivalent of a like).  
Updates `reaction_count` on the post.

**GET /v1/community/posts/{id}/replies**  
List replies for a post.

**POST /v1/community/posts/{id}/replies**  
Add a reply.  
Body: `{ "body": "Held the line." }`

**DELETE /v1/community/replies/{id}**  
Soft delete. Author or admin only.

---

## 3. Messages API Endpoints

**GET /v1/messages/conversations**  
List all conversations for the authenticated user.  
Returns conversation list with: other participant name/avatar, last message preview, unread count, timestamp.

**POST /v1/messages/conversations**  
Create a new DM conversation.  
Role: any authenticated user.  
Body: `{ "participant_id": "uuid" }`  
If a DM already exists between these two users, returns the existing conversation.

**GET /v1/messages/conversations/{id}/messages**  
Load messages for a conversation.  
Query: `?limit=50&cursor={id}` (cursor-based, loads older messages)

**POST /v1/messages/conversations/{id}/messages**  
Send a message.  
Body:
```json
{
  "body": "Adding more lean protein to Tuesday and Thursday lunches.",
  "message_type": "text"
}
```
Inserts to `messages` table. Supabase Realtime broadcasts to `conversation:{id}` channel.

**POST /v1/messages/conversations/{id}/read**  
Mark all messages in conversation as read for the authenticated user.  
Updates `read_at` on unread messages sent by other participants.

---

## 4. Supabase Realtime — Messages

Client-side subscription (Expo):

```typescript
const subscribeToConversation = (conversationId: string, onMessage: (msg: Message) => void) => {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe()
  
  return () => supabase.removeChannel(channel)
}
```

Community feed new post subscription:

```typescript
supabase
  .channel('community:feed')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'community_posts'
  }, (payload) => {
    // Prepend to feed or show "New posts" banner
  })
  .subscribe()
```

---

## 5. Auto-Post from Workout / Benchmark

When a member logs a workout or a PR benchmark result, the app optionally prompts:

> "Share this to the community? Your crew can see it."

If the member confirms, a `community_posts` row is created with `linked_workout_id` or `linked_benchmark_id` populated. The post body is auto-generated:

- Workout: *"Logged: F3 Bootcamp · 45 min · RPE 8 · The Forge"*
- PR: *"New PR — 1-Mile Run · 8:07 · Previous best: 8:32"*

Member can edit the body before posting.

---

## 6. Expo Screens

### 6.1 Community Feed Screen

**Header:** "Community"

**Feed list:**
- Post card: avatar, display name, timestamp, body text, image (if any)
- Linked workout/benchmark chip (tappable, navigates to that record if own)
- Flam reaction button + count
- Reply count + "View replies" tap
- Long press → delete (own posts only)

**Compose button:** Floating action button → Post Compose Sheet

**New posts banner:** If Supabase Realtime delivers new posts while feed is open, show "3 new posts — tap to refresh" banner at top. Do not auto-scroll.

### 6.2 Post Compose Sheet

Bottom sheet:
- Text input (multi-line, 500 char limit)
- Image attach button (optional)
- Link workout toggle (shows today's workout if logged)
- Post button

### 6.3 Post Detail Screen

Full post with all replies threaded below. Reply input pinned at bottom. Keyboard-aware scroll.

### 6.4 Messages Screen

**Conversations list:**
- Sorted by most recent message
- Unread badge (count)
- Chef conversations visually marked with chef badge
- Tap → Conversation screen

### 6.5 Conversation Screen

- Message bubbles (own messages right-aligned, theirs left)
- Timestamps grouped by day
- Real-time via Supabase Realtime subscription
- Text input + send button pinned at bottom
- Image attach (optional, uploads to Supabase Storage `community` bucket)
- Keyboard-aware scroll — input lifts with keyboard
- Auto-scroll to bottom on new message received

### 6.6 Leaderboard Screen *(Phase 2 — placeholder at MVP)*

Tab exists in navigation. Screen shows:
> *"Leaderboards are coming. Keep logging."*

No data rendered. Schema is built. Activate in Phase 2 by building the computation job and this screen.

---

## 7. Community Conventions

**The Flam reaction** — FlamSanct's native reaction. One per member per post. Equivalent to a like but branded. Icon: a small shield flame mark. Tapping again removes it.

**Display names** — Members are identified by `display_name` in the community feed, not email. Set during onboarding.

**No public weight data** — Weight is never shown in the community feed, never in posts, never in leaderboards. Benchmark results and workout data only.

**Moderation** — Admin can delete any post or reply via the admin panel. No member-to-member reporting at MVP — flag requests go through admin via DM.
