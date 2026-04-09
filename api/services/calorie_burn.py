"""Calorie burn estimation — FS-0 §8 MET model."""

# MET values per workout type
MET_VALUES = {
    "f3": 8.0,
    "strength": 5.0,
    "cardio": 7.0,
    "mobility": 3.0,
    "other": 5.0,
}


def estimate_calories(
    workout_type: str,
    duration_minutes: int,
    rpe: int,
    weight_lbs: float,
    correction_factor: float = 1.0,
) -> int:
    """Compute estimated calorie burn using MET + RPE model.

    base_rate = MET * weight_kg * (duration / 60)
    rpe_multiplier = 0.7 + (rpe / 10 * 0.6)  # scales 0.76 to 1.30
    correction_factor: personal calibration from calorie_correction job (default 1.0)
    """
    weight_kg = weight_lbs * 0.453592
    met = MET_VALUES.get(workout_type, 5.0)
    base_rate = met * weight_kg * (duration_minutes / 60)
    rpe_multiplier = 0.7 + (rpe / 10 * 0.6)
    return round(base_rate * rpe_multiplier * correction_factor)
