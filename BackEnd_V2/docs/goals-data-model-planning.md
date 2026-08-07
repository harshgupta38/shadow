# Goals Data Model Planning (V2)

Date: 2026-08-07
Scope: Planning notes for goals domain before milestones/habits/progress modules are implemented.

## Objective
Design goal storage so it is:
- Easy to query in multiple product areas.
- Safe and consistent for status/progress lifecycle.
- Ready to connect milestones and habits without redesign.
- Fast enough for goals list screens (using snapshot/cached fields where useful).

## Currently Present Columns (Implemented Now)
These columns are already part of the current `goals` table design and can be used immediately.

| Column | Type (logical) | Status | Description / Usage |
|---|---|---|---|
| id | integer | Implemented | Primary key for goal records. |
| user_id | integer | Implemented | Owner user ID; use for all user-scoped goal queries. |
| title | string | Implemented | Short goal name shown in lists/cards. |
| summary | string | Implemented | Expanded goal description/context. |
| category | enum-like string | Implemented | Domain grouping (Career, Health, etc.) for filtering and analytics. |
| status | enum-like string | Implemented | Goal lifecycle state: Active, Paused, Completed. |
| motivation | string | Implemented | Why the user wants this goal. |
| success_definition | string | Implemented | What success means for this goal. |
| current_state | string | Implemented | Current reality/baseline before execution. |
| challenges | list of strings (JSON) | Implemented | Current blockers for the goal. |
| strengths | list of strings (JSON) | Implemented | User advantages/assets for execution. |
| success_metrics | list of strings (JSON) | Implemented | Outcome indicators to measure success. |
| insights | list of strings (JSON) | Implemented | Coaching insights/reflections linked to this goal. |
| target_date | date | Implemented | Intended completion date (validated). |
| paused_at | datetime (nullable) | Implemented | Timestamp when goal is paused; null when not paused. |
| completed_at | datetime (nullable) | Implemented | Timestamp when goal is completed; null until completion. |
| progress_percent | integer (0-100) | Implemented | Cached progress value for quick goal list/card rendering. |
| progress_updated_at | datetime | Implemented | Last time progress snapshot was updated. |
| milestones_total | integer | Implemented | Cached total linked milestones count. |
| milestones_completed | integer | Implemented | Cached completed milestones count. |
| habits_total | integer | Implemented | Cached total linked habits count. |
| habits_active | integer | Implemented | Cached active linked habits count. |
| created_at | datetime | Implemented | Record creation timestamp. |
| updated_at | datetime | Implemented | Last update timestamp. |

Implementation notes:
- Default `status` on create: `Active`.
- Current write flow stores one row per goal under a specific `user_id`.

## Future Projected Columns (Planned)
These columns are not yet implemented, but are recommended for upcoming modules.

| Column | Type (logical) | Priority | Description / Usage |
|---|---|---|---|
| start_date | date | High | Actual execution start date; useful for timeline and delay metrics. |
| progress_source | string | Medium | Marks how progress was computed: manual, milestones, habits, mixed. |
| priority | enum-like string | Medium | Goal importance level (Low/Medium/High). |
| order_index | integer | Medium | Manual ordering index for drag/drop or custom sorting. |
| is_archived | boolean | Medium | Soft-hide old goals from default views. |
| archived_at | datetime | Medium | Archive timestamp for retention policies. |
| last_activity_at | datetime | Medium | Last meaningful activity on goal/milestone/habit. |

## Relationship Strategy for Milestones and Habits
Do not store milestone IDs or habit IDs as JSON arrays inside goals.

Recommended model:
- milestones table includes goal_id foreign key (1 goal -> many milestones).
- habits table includes goal_id foreign key if each habit belongs to one goal.
- If habits can support multiple goals, use a join table (goal_habits) instead.

Reason:
- Better referential integrity.
- Better query flexibility.
- Easier status rollups and analytics.

## Progress Strategy
Source of truth should come from related entities and events.

Recommended:
- Maintain goals.progress_percent as a cached snapshot for fast UI.
- Recompute/update snapshot when milestone/habit states change.

This gives:
- Fast list rendering.
- Consistent aggregate behavior.
- Future-friendly analytics.

## Minimum Viable Additions for Next Step
If implementing incrementally, next safest columns to add are:
- start_date
- progress_source
- priority
- order_index
- is_archived
- archived_at
- last_activity_at

## Open Product Decisions (must finalize before heavy implementation)
1) Should progress_percent be editable manually, or always system-calculated?
2) Can a habit belong to multiple goals, or exactly one goal?
3) When status becomes Completed, should progress_percent be forced to 100?
4) Should Paused goals continue accepting progress updates?

## Suggested Rollout Order
1) Finalize decisions above.
2) Expand goal schema/model with agreed core fields.
3) Build milestones model linked to goal_id.
4) Build habits model/link strategy.
5) Add progress updater rules (service-level updates).
6) Expose goals list/filter endpoints by status and progress.

## Notes
This file is a planning reference for upcoming modules. It intentionally separates:
- Stable core goal data.
- Derived/cached progress fields.
- Relationship-based data (milestones/habits).
