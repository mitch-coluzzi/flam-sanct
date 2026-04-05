# FS-4 — Chef Interface
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1, FS-3

---

## 1. Overview

The Chef interface is a separate tab/screen set within the same Expo app. When a user logs in with the `chef` role, they see the Chef dashboard instead of the Member dashboard. Admins can switch between views.

The Chef's core jobs:
- Log meals for assigned members
- Affirm or adjust photo captures
- Receive and act on AI-generated dietary directives
- Manage their recipe database
- Communicate with members via DM

---

## 2. API Endpoints

All Chef endpoints require `role: chef`. Requests are validated against `chef_assignments` to ensure the chef can only act on their assigned members.

**GET /v1/chef/members**  
List all members assigned to the authenticated chef with today's summary for each.  
Response per member:
```json
{
  "user_id": "uuid",
  "display_name": "Mitch",
  "today": {
    "calories_in": 1240,
    "calories_out": 680,
    "meals_logged": 2,
    "pending_photo_affirms": 1,
    "active_directives": 1
  }
}
```

**GET /v1/chef/pending-affirms**  
All photo captures pending affirmation across all assigned members.  
Sorted by `created_at` ascending (oldest first).

**GET /v1/chef/directives**  
All active dietary directives for the chef's assigned members.

**PATCH /v1/chef/directives/{id}/acknowledge**  
Chef marks a directive as seen. Sets a `chef_acknowledged_at` field.

---

## 3. Expo Screens

### 3.1 Chef Dashboard

**Header:** "Your Members — {date}"

**Member cards (one per assigned member):**
- Member name + avatar
- Today's calorie snapshot (in / out)
- Pending photo affirm badge (red dot if any)
- Active directive badge (amber if any)
- Tap → Member Detail view

**Pending Affirms section** (shown if any pending across all members):
- Compact list of pending photo captures
- Tap → opens Affirm Sheet

### 3.2 Member Detail View

Full view of one member's data:
- Today's food log (all entries)
- Today's workout(s)
- Active dietary directives
- "Log Meal" button → Add Food Sheet (FS-3) pre-scoped to this member
- "Message" button → DM conversation

### 3.3 Affirm Sheet

Bottom sheet for a single photo capture:
- Photo displayed
- AI estimate shown: food name, calories, macros
- "Affirm" button (accept as-is)
- "Adjust" option: edit food name, calories, and macro fields inline
- "Chef Note" optional text field
- Submit → POST /v1/food-logs/{id}/affirm

### 3.4 Recipe Manager Screen

List of chef's saved recipes. Search + filter by tag.  
Tap → Recipe Detail (edit/delete).  
"+ New Recipe" → create form.

### 3.5 Directives Screen

List of all active directives across assigned members.  
Each directive shows:
- Member name
- Directive text
- Issued by (AI or admin)
- Age ("2 days ago")
- "Acknowledge" button

---

## 4. Chef ↔ Member DM

Each chef-member pair has a dedicated `dm` conversation created automatically when the chef assignment is made. The system posts a welcome message:

> *"Chef {name} has been assigned to your nutrition. You can message them directly here."*

This conversation appears in both the chef's Messages tab and the member's Messages tab. Real-time via Supabase Realtime channel `conversation:{id}`.
