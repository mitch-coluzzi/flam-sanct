"""Benchmark & progress endpoints — FS-6 §3."""

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role, get_current_user
from api.services.notifications import send_push_notification

router = APIRouter(tags=["benchmarks"])
member_or_admin = require_role(["member", "admin"])


class BenchmarkResultCreate(BaseModel):
    benchmark_id: str
    result_value: float
    log_date: str
    notes: Optional[str] = None
    secondary_value: Optional[float] = None
    secondary_unit: Optional[str] = None


# ── Benchmarks ──

@router.get("/benchmarks")
async def list_benchmarks(
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()
    result = sb.table("benchmarks").select("*").eq("is_active", True).order("category").execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


# ── Benchmark Results ──

@router.post("/benchmark-results")
async def create_benchmark_result(
    body: BenchmarkResultCreate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get benchmark info for PR detection
    bm = sb.table("benchmarks").select("name, unit, lower_is_better").eq("id", body.benchmark_id).single().execute()
    if not bm.data:
        raise HTTPException(status_code=404, detail="Benchmark not found")

    benchmark = bm.data

    # Check for PR: get previous best
    previous = (
        sb.table("benchmark_results")
        .select("result_value")
        .eq("user_id", user["user_id"])
        .eq("benchmark_id", body.benchmark_id)
        .order("result_value", desc=not benchmark["lower_is_better"])
        .limit(1)
        .execute()
    )

    is_pr = False
    prev_best = None
    if previous.data:
        prev_best = previous.data[0]["result_value"]
        if benchmark["lower_is_better"]:
            is_pr = body.result_value < prev_best
        else:
            is_pr = body.result_value > prev_best
    else:
        # First result is always a PR
        is_pr = True

    row = body.model_dump(exclude_none=True)
    row["user_id"] = user["user_id"]
    row["is_pr"] = is_pr

    result = sb.table("benchmark_results").insert(row).execute()

    # If PR, send push notification
    if is_pr and prev_best is not None:
        if benchmark["lower_is_better"]:
            delta_pct = round((prev_best - body.result_value) / prev_best * 100, 1)
            direction = "faster"
        else:
            delta_pct = round((body.result_value - prev_best) / prev_best * 100, 1)
            direction = "more"

        await send_push_notification(
            sb, user["user_id"],
            title=f"New PR — {benchmark['name']}",
            body=f"{body.result_value} {benchmark['unit']}. {delta_pct}% {direction} than previous best.",
        )

    return {
        "data": {
            **(result.data[0] if result.data else {}),
            "is_pr": is_pr,
            "previous_best": prev_best,
        },
        "error": None,
        "meta": {"timestamp": now},
    }


@router.get("/benchmark-results")
async def list_benchmark_results(
    request: Request,
    user: dict = Depends(member_or_admin),
):
    """All benchmark results grouped by benchmark with trend data."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get all results with benchmark info
    results = (
        sb.table("benchmark_results")
        .select("*, benchmark:benchmarks(name, unit, lower_is_better, category)")
        .eq("user_id", user["user_id"])
        .order("log_date")
        .execute()
    )

    # Group by benchmark
    grouped: dict[str, dict] = {}
    for r in (results.data or []):
        bm = r.get("benchmark", {})
        bm_id = r["benchmark_id"]
        if bm_id not in grouped:
            grouped[bm_id] = {
                "benchmark": bm,
                "results": [],
                "pr": None,
                "trend": "unknown",
                "delta_pct": 0,
            }
        grouped[bm_id]["results"].append(r)

    # Compute PR and trend per benchmark
    for bm_id, data in grouped.items():
        res_list = data["results"]
        bm_info = data["benchmark"]
        lower = bm_info.get("lower_is_better", True)

        # PR
        pr_result = min(res_list, key=lambda x: x["result_value"]) if lower else max(res_list, key=lambda x: x["result_value"])
        data["pr"] = pr_result["result_value"]

        # Trend (compare first vs last)
        if len(res_list) >= 2:
            first = res_list[0]["result_value"]
            last = res_list[-1]["result_value"]
            if first != 0:
                pct = round((last - first) / first * 100, 1)
                if lower:
                    data["trend"] = "improving" if pct < 0 else "declining"
                else:
                    data["trend"] = "improving" if pct > 0 else "declining"
                data["delta_pct"] = pct

    return {"data": list(grouped.values()), "error": None, "meta": {"timestamp": now}}


# ── Progress ──

@router.get("/progress/weight")
async def weight_trend(
    request: Request,
    days: int = 90,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()
    start = (date.today() - timedelta(days=days)).isoformat()

    result = (
        sb.table("daily_logs")
        .select("log_date, weight_lbs")
        .eq("user_id", user["user_id"])
        .gte("log_date", start)
        .not_.is_("weight_lbs", "null")
        .order("log_date")
        .execute()
    )

    points = [{"date": r["log_date"], "weight_lbs": r["weight_lbs"]} for r in (result.data or [])]

    trend_data = {"points": points, "start": None, "current": None, "delta": 0, "trend": "unknown"}
    if len(points) >= 2:
        trend_data["start"] = points[0]["weight_lbs"]
        trend_data["current"] = points[-1]["weight_lbs"]
        trend_data["delta"] = round(points[-1]["weight_lbs"] - points[0]["weight_lbs"], 1)
        trend_data["trend"] = "declining" if trend_data["delta"] < -0.5 else "increasing" if trend_data["delta"] > 0.5 else "flat"

    return {"data": trend_data, "error": None, "meta": {"timestamp": now}}


@router.get("/progress/summary")
async def progress_summary(
    request: Request,
    user: dict = Depends(member_or_admin),
):
    """Full progress summary for Progress screen and AI layer."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    from api.services.digest import build_member_context
    context = await build_member_context(sb, user["user_id"], days=30)

    # Active goals
    goals = (
        sb.table("member_goals")
        .select("*")
        .eq("user_id", user["user_id"])
        .eq("is_active", True)
        .execute()
    )

    return {
        "data": {
            **context,
            "goals": goals.data or [],
        },
        "error": None,
        "meta": {"timestamp": now},
    }
