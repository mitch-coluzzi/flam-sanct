"""Anomaly detection — FS-5 §4."""

from datetime import date, timedelta


def detect_anomalies(context: dict) -> list[dict]:
    """Check member context for anomaly conditions. Returns list of triggered anomalies."""
    anomalies = []
    recovery = context.get("recovery", {})
    workouts = context.get("workouts", {})
    nutrition = context.get("nutrition", {})
    weight = context.get("weight_trend", {})
    member = context.get("member", {})

    # Sleep declining: avg < 6 hours for 3+ consecutive days
    if recovery.get("avg_sleep_hours", 8) < 6:
        anomalies.append({
            "type": "sleep_alert",
            "short_message": f"Your sleep has averaged {recovery['avg_sleep_hours']} hours recently.",
            "data": {"avg_sleep": recovery["avg_sleep_hours"]},
        })

    # Mood crisis: -4 on any single day = immediate alert
    latest_mood = recovery.get("latest_mood")
    if latest_mood is not None and latest_mood <= -4:
        anomalies.append({
            "type": "mood_crisis",
            "short_message": "You logged Crisis today. If you're in a tough spot, talking to someone helps.",
            "data": {"mood": latest_mood, "label": "Crisis"},
            "crisis": True,
        })

    # Mood declining: avg <= -2 for 3+ consecutive days
    avg_mood = recovery.get("avg_mood", 0)
    mood_label = recovery.get("avg_mood_label", "")
    if avg_mood <= -2:
        anomalies.append({
            "type": "mood_alert",
            "short_message": f"You've been logging {mood_label or 'Low'} or below for several days.",
            "data": {"avg_mood": avg_mood, "label": mood_label},
        })

    # High RPE streak: 5+ sessions RPE >= 8 with no rest day
    workout_list = workouts.get("last_n_days", [])
    high_rpe_count = sum(1 for w in workout_list if w.get("rpe", 0) >= 8)
    rest_days = workouts.get("rest_days", 7)
    if high_rpe_count >= 5 and rest_days == 0:
        anomalies.append({
            "type": "overtraining_alert",
            "short_message": f"{high_rpe_count} sessions at RPE 8+ with no rest days.",
            "data": {"high_rpe_sessions": high_rpe_count, "rest_days": rest_days},
        })

    # Calorie deficit extreme: net < 800 for 2+ days
    avg_net = nutrition.get("avg_net_calories", 2000)
    if avg_net < 800:
        anomalies.append({
            "type": "nutrition_alert",
            "short_message": f"Average net calories at {avg_net}. That's critically low.",
            "data": {"avg_net_calories": avg_net},
        })

    # Protein critically low: < 0.6g per lb bodyweight for 5+ days
    current_weight = member.get("current_weight_lbs", 180)
    avg_protein = nutrition.get("avg_protein_g", 999)
    protein_threshold = current_weight * 0.6
    if avg_protein < protein_threshold:
        anomalies.append({
            "type": "protein_alert",
            "short_message": f"Protein averaging {avg_protein}g — below {protein_threshold:.0f}g minimum for your weight.",
            "data": {"avg_protein": avg_protein, "threshold": protein_threshold},
        })

    # Weight stall: no change +/- 0.5 lbs over 21 days
    delta = abs(weight.get("delta", 999))
    if delta <= 0.5 and weight.get("trend") == "flat":
        anomalies.append({
            "type": "plateau_alert",
            "short_message": "Weight hasn't moved in three weeks despite consistent logging.",
            "data": {"weight_delta": weight["delta"]},
        })

    return anomalies
