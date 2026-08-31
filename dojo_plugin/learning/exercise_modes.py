SUPPORTED_EXERCISE_MODE = "CONTAINER"
SUPPORTED_EXERCISE_MODES = frozenset({"CONTAINER", "SIMULATION", "HYBRID"})
RETIRED_EXERCISE_MODES = frozenset()


def exercise_mode(value):
    if hasattr(value, "exercise_mode"):
        value = value.exercise_mode
    return str(value or SUPPORTED_EXERCISE_MODE).strip().upper()


def is_supported_exercise(value):
    return exercise_mode(value) in SUPPORTED_EXERCISE_MODES


def is_retired_exercise(value):
    return exercise_mode(value) in RETIRED_EXERCISE_MODES
