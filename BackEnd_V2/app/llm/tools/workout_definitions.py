"""What the model sees of the Workout Coach's tools: names, descriptions and argument schemas (workout.py holds the code that runs).

Every schema follows OpenAI's strict rules: all properties are required, extras are forbidden, and an optional value is a nullable
type. Each tool, and each argument, costs tokens on every step of a conversation, so descriptions are kept short.
"""

from enum import Enum
from typing import get_args

from app.schemas.workout import EquipmentType, ExerciseKind, Goal, Level, MuscleId, OwnedEquipment

MAX_HISTORY_DAYS = 90
DEFAULT_HISTORY_DAYS = 14
MIN_BALANCE_DAYS = 7
DEFAULT_BALANCE_DAYS = 30
MAX_PROGRESS_SESSIONS = 30
DEFAULT_PROGRESS_SESSIONS = 10
MAX_SEARCH_RESULTS = 25
DEFAULT_SEARCH_RESULTS = 8

_MUSCLES = list(get_args(MuscleId))
_LEVELS = list(get_args(Level))
_GOALS = list(get_args(Goal))
_KINDS = list(get_args(ExerciseKind))
_EQUIPMENT_TYPES = list(get_args(EquipmentType))
_OWNED_EQUIPMENT = list(get_args(OwnedEquipment))

_NO_ARGS = {"type": "object", "properties": {}, "required": [], "additionalProperties": False}

# One place in a session, which the app fills with a real exercise (see workout_plan_builder_service).
_PLAN_SLOT_SCHEMA = {
    "type": "object",
    "properties": {
        "muscle": {"type": ["string", "null"], "enum": [*_MUSCLES, None], "description": "The main muscle this slot trains. Null makes it a cardio slot."},
        "hint": {"type": ["string", "null"], "description": "Optional words to prefer in the exercise name, such as 'push-up', 'row' or 'walk'. Null lets the app choose."},
        "exercise_id": {"type": ["integer", "null"], "description": "Only to keep an exact exercise, for example from an existing plan. Otherwise null."},
        "sets": {"type": ["integer", "null"], "description": "Number of sets. Null for the usual."},
        "reps": {"type": ["string", "null"], "description": "Reps per set such as '8-12', or '20 min' for cardio. Null for the usual."},
        "rest_seconds": {"type": ["integer", "null"], "description": "Rest between sets. Null for the usual."},
    },
    "required": ["muscle", "hint", "exercise_id", "sets", "reps", "rest_seconds"],
    "additionalProperties": False,
}


class WorkoutToolDefinitions(Enum):
    GET_WORKOUT_OVERVIEW = {
        "type": "function",
        "function": {
            "name": "get_workout_overview",
            "description": (
                "The user's current training picture: today's date, the plan they follow, today's planned workout and warm-up, whether they "
                "trained today, this week day by day, volume, muscles trained this week and their streak. Use it for 'what should I do "
                "today', 'how is my week going' and before advice that depends on their plan."
            ),
            "strict": True,
            "parameters": _NO_ARGS,
        },
    }
    GET_WORKOUT_HISTORY = {
        "type": "function",
        "function": {
            "name": "get_workout_history",
            "description": (
                "Look back over completed workouts: date, name, minutes, sets and volume of each, workouts per week, days since the last "
                "one and how closely the user followed their plan. Use it for 'how was my last month' or 'am I consistent'. Set "
                "include_exercises to also list every exercise and set (keep the range short then)."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": MAX_HISTORY_DAYS,
                        "description": f"How many days back to look, ending today (at most {MAX_HISTORY_DAYS}). Use null for {DEFAULT_HISTORY_DAYS}.",
                    },
                    "include_exercises": {
                        "type": "boolean",
                        "description": "True to list the exercises and sets of each workout. False for the summary only, which is much smaller.",
                    },
                },
                "required": ["days", "include_exercises"],
                "additionalProperties": False,
            },
        },
    }
    GET_WORKOUT_SESSION = {
        "type": "function",
        "function": {
            "name": "get_workout_session",
            "description": (
                "One workout in full: every exercise with the sets, reps and weights the user logged, their notes and the totals. Get the "
                "session_id from get_workout_history first."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "integer", "description": "The session_id of the workout, from get_workout_history."}},
                "required": ["session_id"],
                "additionalProperties": False,
            },
        },
    }
    GET_EXERCISE_PROGRESS = {
        "type": "function",
        "function": {
            "name": "get_exercise_progress",
            "description": (
                "How the user is progressing on one exercise: recent sessions with sets and weights, the best set, an estimated one-rep max "
                "and the trend. Use it for 'am I getting stronger on bench press', 'what weight should I use' or before suggesting "
                "progression. Give exercise_id or exercise_name, and null for the other."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "exercise_id": {"type": ["integer", "null"], "description": "The exercise's id, if you have it. Null if you give a name."},
                    "exercise_name": {"type": ["string", "null"], "description": "The exercise name, for example 'bench press'. Null if you give an id."},
                    "sessions": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": MAX_PROGRESS_SESSIONS,
                        "description": f"How many of the latest sessions of it to look at (at most {MAX_PROGRESS_SESSIONS}). Use null for {DEFAULT_PROGRESS_SESSIONS}.",
                    },
                },
                "required": ["exercise_id", "exercise_name", "sessions"],
                "additionalProperties": False,
            },
        },
    }
    GET_TRAINING_BALANCE = {
        "type": "function",
        "function": {
            "name": "get_training_balance",
            "description": (
                "How training is spread across muscles over a period: weighted sets per muscle, the weekly average, muscles not trained at "
                "all, and the most and least trained. Use it for 'is my training balanced' or 'what am I missing', or when designing or "
                "fixing a plan."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": ["integer", "null"],
                        "minimum": MIN_BALANCE_DAYS,
                        "maximum": MAX_HISTORY_DAYS,
                        "description": f"How many days back to look, ending today ({MIN_BALANCE_DAYS} to {MAX_HISTORY_DAYS}). Use null for {DEFAULT_BALANCE_DAYS}.",
                    }
                },
                "required": ["days"],
                "additionalProperties": False,
            },
        },
    }
    GET_WORKOUT_PLANS = {
        "type": "function",
        "function": {
            "name": "get_workout_plans",
            "description": (
                "The plans the user can use (ready-made and their own) with id, goal, level, training days and whether they follow it now. "
                "Give a plan_id to see that one plan in full instead: each day with its exercises, sets, reps and rest. Use it to review the "
                "plan they follow or as the starting point for a changed version."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {"plan_id": {"type": ["integer", "null"], "description": "A plan's id, from the list or the overview. Null to list all plans."}},
                "required": ["plan_id"],
                "additionalProperties": False,
            },
        },
    }
    SEARCH_EXERCISES = {
        "type": "function",
        "function": {
            "name": "search_exercises",
            "description": (
                "Look exercises up in the library: names, main muscles, equipment and how each is counted. Use it to answer questions about "
                "exercises ('good chest exercises I can do at home') or to find one by name. Do not use it to build a plan: the plan tool chooses "
                "exercises itself. Pass muscles to get results grouped by muscle (limit is per muscle). Null means no filter. usual_dose shows "
                "how an exercise is counted: '3 × 8-12' is reps, '3 × 30 sec' a time per set, '20 min' one timed block."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": ["string", "null"], "description": "Words from the exercise name, for example 'squat' or 'row'. Null to not filter by name."},
                    "muscles": {
                        "type": ["array", "null"],
                        "items": {"type": "string", "enum": _MUSCLES},
                        "description": "The main muscles to find exercises for. Null for any.",
                    },
                    "equipment_type": {
                        "type": ["string", "null"],
                        "enum": [*_EQUIPMENT_TYPES, None],
                        "description": "no_equipment for bodyweight work at home, light_equipment for a few portable items (dumbbells, bands), heavy_equipment for gym machines and barbells. Null for any.",
                    },
                    "kind": {"type": ["string", "null"], "enum": [*_KINDS, None], "description": "strength (the default), cardio or warmup. Null means strength."},
                    "max_level": {"type": ["string", "null"], "enum": [*_LEVELS, None], "description": "The hardest level to include, so a beginner never gets advanced moves. Null for any."},
                    "limit": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": MAX_SEARCH_RESULTS,
                        "description": f"How many to return (at most {MAX_SEARCH_RESULTS}). Null for {DEFAULT_SEARCH_RESULTS}.",
                    },
                },
                "required": ["query", "muscles", "equipment_type", "kind", "max_level", "limit"],
                "additionalProperties": False,
            },
        },
    }
    GET_EXERCISE_DETAILS = {
        "type": "function",
        "function": {
            "name": "get_exercise_details",
            "description": (
                "How to do an exercise: step-by-step instructions, tips, common mistakes, the muscles it works, good warm-ups, and the "
                "user's own last performance of it. Use it for form and technique questions instead of answering from memory. Give "
                "exercise_id or exercise_name, and null for the other."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "exercise_id": {"type": ["integer", "null"], "description": "The exercise's id, if you have it. Null if you give a name."},
                    "exercise_name": {"type": ["string", "null"], "description": "The exercise name, for example 'romanian deadlift'. Null if you give an id."},
                },
                "required": ["exercise_id", "exercise_name"],
                "additionalProperties": False,
            },
        },
    }
    CREATE_WORKOUT_PLAN_PROPOSAL = {
        "type": "function",
        "function": {
            "name": "create_workout_plan_proposal",
            "description": (
                "Hand the user a complete workout plan to review. It only creates a draft: the user edits it in a review panel and saves it "
                "themselves, so you need no confirmation once you know what they need. You do NOT search for exercises first: describe each "
                "place in a session as a slot (the muscle it trains, plus an optional hint such as 'push-up' or 'row') and the app picks a real "
                "exercise that fits their level and equipment. Always give the whole plan, also when revising. weekday is 0 (Sunday) to 6 (Saturday)."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "A short plan name, such as 'Upper / Lower, 4 days'."},
                    "description": {"type": "string", "description": "One or two sentences on what the plan is for."},
                    "rationale": {"type": "string", "description": "A few sentences on why this plan fits the user. Shown above the plan in the review panel."},
                    "goal": {"type": "string", "enum": _GOALS, "description": "The main goal the plan serves."},
                    "level": {"type": "string", "enum": _LEVELS, "description": "The experience level the plan is built for."},
                    "equipment": {
                        "type": "array",
                        "items": {"type": "string", "enum": _OWNED_EQUIPMENT},
                        "description": "Everything the user has besides their own body, such as dumbbell or band. Empty for bodyweight only. full_gym for a gym.",
                    },
                    "days": {
                        "type": "array",
                        "description": "The training days, one per weekday, 1 to 7 of them.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "weekday": {"type": "integer", "minimum": 0, "maximum": 6, "description": "0 = Sunday ... 6 = Saturday."},
                                "name": {"type": "string", "description": "A short session name, such as 'Push'."},
                                "exercises": {
                                    "type": "array",
                                    "description": "The session's slots in order, big compound lifts first. Usually 4 to 6.",
                                    "items": _PLAN_SLOT_SCHEMA,
                                },
                            },
                            "required": ["weekday", "name", "exercises"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["name", "description", "rationale", "goal", "level", "equipment", "days"],
                "additionalProperties": False,
            },
        },
    }


WORKOUT_TOOL_DEFINITIONS: list[dict] = [definition.value for definition in WorkoutToolDefinitions]
