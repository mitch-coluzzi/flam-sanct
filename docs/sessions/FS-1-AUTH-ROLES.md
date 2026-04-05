# FS-1 — Auth & Roles
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0 (tables: `users`, `chef_assignments`)

---

## 1. Overview

FlamSanct uses Supabase Auth for identity and JWT-based session management. FastAPI validates tokens on every request. Role is stored on the `users` table and encoded into the JWT custom claims on login.

---

## 2. Auth Flow

### 2.1 Signup
- Email + password only at MVP.
- On Supabase Auth user creation, a `users` row is inserted via a Supabase database trigger.
- Default role on signup: `member`.
- Admin promotes users to `chef` or `admin` via the Admin panel (FS-Admin).
- New members land on an onboarding flow (timezone, weight, display name, push notification opt-in) before accessing the main app. `onboarded_at` is set on completion.

### 2.2 Login
- Supabase Auth returns a JWT.
- FastAPI middleware decodes the JWT and injects the user context into every request.
- Custom claim `app_role` is set via a Supabase Auth hook on login, reading from `users.role`.

### 2.3 Token Refresh
- Supabase handles refresh token rotation automatically.
- Expo app stores tokens in `expo-secure-store` (not AsyncStorage).

### 2.4 Logout
- Supabase `signOut()` on client. FastAPI stateless — no server-side session to invalidate.

---

## 3. FastAPI Role Enforcement

```python
# dependencies/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
import jwt

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        role = payload.get("app_role", "member")
        return {"user_id": user_id, "role": role}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

def require_role(allowed_roles: list[str]):
    async def role_checker(user=Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return user
    return role_checker
```

Usage on any route:
```python
@router.get("/admin/users")
async def list_users(user=Depends(require_role(["admin"]))):
    ...

@router.post("/food-logs")
async def create_food_log(user=Depends(require_role(["member", "admin"]))):
    ...
```

---

## 4. Supabase Auth Hook — Custom Claims

Add `app_role` to JWT on every login via a Supabase Edge Function hook:

```typescript
// supabase/functions/custom-claims/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { user_id } = await req.json()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user_id)
    .single()

  return new Response(
    JSON.stringify({ app_role: data?.role ?? 'member' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

Register this as the `custom_access_token` hook in Supabase Auth settings.

---

## 5. Database Trigger — Auto-Insert User Row

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'member'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 6. API Endpoints

### Auth (no JWT required)
These are handled by Supabase Auth client SDK directly. No FastAPI endpoints needed.

| Action | Supabase SDK call |
|---|---|
| Sign up | `supabase.auth.signUp({ email, password })` |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` |
| Sign out | `supabase.auth.signOut()` |
| Get session | `supabase.auth.getSession()` |
| Refresh token | Automatic |

### Profile

**GET /v1/users/me**  
Returns the current user's full profile row.  
Role: any authenticated user.

**PATCH /v1/users/me**  
Update display name, timezone, weight unit, push token.  
Role: any authenticated user.  
Body:
```json
{
  "display_name": "Mitch",
  "timezone": "America/Chicago",
  "weight_unit": "lbs",
  "push_token": "ExponentPushToken[...]"
}
```

### Admin — User Management

**GET /v1/admin/users**  
List all users with role, chef assignment, onboarding status.  
Role: admin.  
Query params: `?role=chef&limit=20&cursor={id}`

**PATCH /v1/admin/users/{user_id}/role**  
Promote or demote a user's role.  
Role: admin.  
Body: `{ "role": "chef" }`

**POST /v1/admin/chef-assignments**  
Assign a chef to a member.  
Role: admin.  
Body: `{ "chef_id": "uuid", "member_id": "uuid" }`  
Deactivates any existing active assignment for that member first.

**DELETE /v1/admin/chef-assignments/{id}**  
Deactivate a chef assignment. Sets `active = false`, `ended_at = now()`.  
Role: admin.

**GET /v1/admin/chef-assignments**  
List all active assignments.  
Role: admin.

---

## 7. Onboarding Flow (Expo)

Triggered when `users.onboarded_at IS NULL` after login.

**Screen 1 — Welcome**  
FlamSanct brand. Tagline. "Let's get you set up."

**Screen 2 — Your Info**  
- Display name (text input)
- Current weight (numeric + unit toggle lbs/kg)
- Timezone (auto-detected, confirm or override)

**Screen 3 — Notifications**  
- Morning check-in reminder (time picker, default 6:00 AM)
- Evening reflection reminder (time picker, default 8:30 PM)
- Expo push notification permission request

**Screen 4 — Your Chef**  
Display the assigned chef's name and photo if already assigned.  
If not yet assigned: "Your chef will be connected by your admin shortly."

**Screen 5 — Done**  
PATCH `/v1/users/me` to save profile. Set `onboarded_at = now()`. Navigate to main app.

---

## 8. Row Level Security (RLS)

Enable RLS on all tables. Base policies:

```sql
-- users: can only read/update own row (admin bypasses via service role)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own" ON users
  FOR ALL USING (auth.uid() = id);

-- daily_logs: members see own logs only
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_logs_own" ON daily_logs
  FOR ALL USING (auth.uid() = user_id);

-- food_logs: member sees own; chef sees assigned members
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "food_logs_member" ON food_logs
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "food_logs_chef" ON food_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chef_assignments ca
      WHERE ca.chef_id = auth.uid()
      AND ca.member_id = food_logs.user_id
      AND ca.active = true
    )
  );

-- messages: participants only
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_participant" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );
```

All admin operations use the service role key on the FastAPI backend — bypasses RLS.

---

## 9. Environment Variables

```env
# FastAPI / Railway
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_JWT_SECRET=xxx
ANTHROPIC_API_KEY=xxx

# Expo / EAS
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
EXPO_PUBLIC_API_BASE_URL=https://api.flamsanct.com/v1
```
