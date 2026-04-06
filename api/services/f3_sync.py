"""F3 Nation API sync — pull attendance data for FlamSanct members."""

import os
import httpx
from datetime import date, timedelta

F3_API_BASE = "https://api.f3nation.com"
F3_API_KEY = os.environ.get("F3_NATION_API_KEY", "")
DSM_ORG_ID = os.environ.get("F3_DSM_ORG_ID", "36348")

REGION_PREFIXES = ["F3 Des Moines-", "F3 Des Moines -", "Des Moines"]


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {F3_API_KEY}",
        "Client": "flamsanct",
        "Content-Type": "application/json",
    }


def _get(endpoint: str, params: dict = None) -> dict | list | None:
    try:
        r = httpx.get(
            f"{F3_API_BASE}{endpoint}",
            headers=_headers(),
            params=params or {},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json()
        return None
    except Exception:
        return None


def _normalize(name: str) -> str:
    n = name.strip()
    for prefix in REGION_PREFIXES:
        if n.startswith(prefix):
            n = n[len(prefix):].strip()
            break
    return " ".join(n.split())


def get_dsm_locations() -> dict[str, str]:
    """Return {location_id: ao_name} for DSM."""
    data = _get("/v1/location", {"regionIds": DSM_ORG_ID, "statuses": "active", "pageSize": 50})
    if not data:
        return {}
    locs = data if isinstance(data, list) else data.get("locations", data.get("data", []))
    return {str(loc.get("id", "")): _normalize(loc.get("locationName", "Unknown")) for loc in locs if loc.get("id")}


def get_events(start_date: str, end_date: str) -> list:
    """Get DSM event instances for a date range."""
    data = _get("/v1/event-instance", {
        "regionOrgId": DSM_ORG_ID,
        "startDate": start_date,
        "endDate": end_date,
        "pageSize": "100",
    })
    if not data:
        return []
    return data if isinstance(data, list) else data.get("eventInstances", data.get("data", []))


def get_attendance(event_id: int, planned: bool = False) -> list:
    """Get attendance for an event. planned=True for HC, False for backblast."""
    data = _get(f"/v1/attendance/event-instance/{event_id}", {"isPlanned": str(planned).lower()})
    if not data:
        return []
    return data if isinstance(data, list) else data.get("attendance", [])


async def sync_member_workouts(sb, user_id: str, f3_name: str, days_back: int = 7) -> dict:
    """
    Pull F3 attendance for a member and create workout entries.
    Matches by f3_name (case-insensitive).
    Returns {"synced": int, "already_logged": int}.
    """
    end = date.today()
    start = end - timedelta(days=days_back)
    events = get_events(start.isoformat(), end.isoformat())
    ao_map = get_dsm_locations()

    f3_lower = f3_name.strip().lower()
    synced = 0
    already_logged = 0

    for e in events:
        event_id = e.get("id")
        event_date = e.get("startDate", "")
        if not event_id or not event_date or event_date > end.isoformat():
            continue

        # Check actual attendance (backblast)
        records = get_attendance(event_id, planned=False)
        if not records:
            continue

        # Find this member in attendance
        member_record = None
        for rec in records:
            user = rec.get("user") or {}
            name = _normalize(user.get("f3Name") or user.get("name") or "")
            if name.lower() == f3_lower:
                member_record = rec
                break

        if not member_record:
            continue

        # Check if we already have a workout for this date + AO
        loc_id = str(e.get("locationId") or e.get("orgId") or "")
        ao_name = ao_map.get(loc_id) or _normalize(e.get("name") or "F3 Workout")

        existing = (
            sb.table("workouts")
            .select("id")
            .eq("user_id", user_id)
            .eq("log_date", event_date)
            .eq("f3_ao", ao_name)
            .limit(1)
            .execute()
        )
        if existing.data:
            already_logged += 1
            continue

        # Determine if Q
        att_types = member_record.get("attendanceTypes") or []
        is_q = any(a.get("type") == "Q" for a in att_types)
        q_user = None
        if not is_q:
            # Find who Q'd
            for rec in records:
                r_types = rec.get("attendanceTypes") or []
                if any(a.get("type") == "Q" for a in r_types):
                    q_u = rec.get("user") or {}
                    q_user = _normalize(q_u.get("f3Name") or "")
                    break

        # Get member weight for calorie calc
        weight_result = (
            sb.table("daily_logs")
            .select("weight_lbs")
            .eq("user_id", user_id)
            .not_.is_("weight_lbs", "null")
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        weight_lbs = float(weight_result.data[0]["weight_lbs"]) if weight_result.data else 185.0

        # Default F3 workout: 45 min, RPE 7, MET 8.0
        duration = 45
        rpe = 7
        weight_kg = weight_lbs * 0.453592
        rpe_mult = 0.7 + (rpe / 10 * 0.6)
        est_cal = round(8.0 * weight_kg * (duration / 60) * rpe_mult)

        sb.table("workouts").insert({
            "user_id": user_id,
            "log_date": event_date,
            "workout_type": "f3",
            "workout_label": f"F3 — {ao_name}",
            "duration_minutes": duration,
            "rpe": rpe,
            "estimated_calories_burned": est_cal,
            "is_f3": True,
            "f3_ao": ao_name,
            "f3_q": f3_name if is_q else (q_user or None),
            "notes": "Auto-synced from F3 Nation",
        }).execute()

        # Ensure daily log exists
        existing_log = (
            sb.table("daily_logs")
            .select("id")
            .eq("user_id", user_id)
            .eq("log_date", event_date)
            .limit(1)
            .execute()
        )
        if not existing_log.data:
            sb.table("daily_logs").insert({
                "user_id": user_id,
                "log_date": event_date,
            }).execute()

        synced += 1

    return {"synced": synced, "already_logged": already_logged}


async def get_dsm_ao_list() -> list[dict]:
    """Return list of DSM AOs with names for dropdown."""
    ao_map = get_dsm_locations()
    return [{"id": k, "name": v} for k, v in sorted(ao_map.items(), key=lambda x: x[1])]
