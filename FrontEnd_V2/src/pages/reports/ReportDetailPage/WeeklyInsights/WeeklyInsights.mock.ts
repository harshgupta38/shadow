import type { WeeklyInsights } from "@/api/types";

// Preview-only sample data. The backend does not produce weekly insights yet.
export const WEEKLY_INSIGHTS_MOCK: WeeklyInsights = {
  days: [
    { tasks_done: 3, tasks_total: 4, habits_done: 5, habits_total: 6, prev_completion_pct: 70 },
    { tasks_done: 4, tasks_total: 5, habits_done: 6, habits_total: 6, prev_completion_pct: 82 },
    { tasks_done: 5, tasks_total: 5, habits_done: 6, habits_total: 6, prev_completion_pct: 75 },
    { tasks_done: 2, tasks_total: 5, habits_done: 3, habits_total: 6, prev_completion_pct: 90 },
    { tasks_done: 4, tasks_total: 4, habits_done: 5, habits_total: 6, prev_completion_pct: 64 },
    { tasks_done: 3, tasks_total: 4, habits_done: 4, habits_total: 6, prev_completion_pct: 55 },
    { tasks_done: 1, tasks_total: 3, habits_done: 3, habits_total: 5, prev_completion_pct: 60 },
  ],
  comparison: [
    { id: "alignment", label: "Alignment score", value: 78, previous: 69, kind: "points" },
    { id: "tasks", label: "Tasks completed", value: 73, previous: 64, kind: "points", suffix: "%" },
    { id: "habits", label: "Habits completed", value: 78, previous: 81, kind: "points", suffix: "%" },
    { id: "strong_days", label: "Days above 70%", value: 5, previous: 3, kind: "days", suffix: "/7" },
    { id: "focus_time", label: "Planned time done", value: 1120, previous: 960, kind: "minutes" },
  ],
  score_trend: [54, 61, 58, 66, 69, 78],
  habits: [
    { id: 1, title: "Morning run", cells: ["done", "done", "done", "done", "done", "done", "done"], streak: 21, prev_done: 7, prev_planned: 7 },
    { id: 2, title: "Journal", cells: ["done", "done", "done", "done", "done", "done", "skipped"], streak: 12, prev_done: 6, prev_planned: 6 },
    { id: 3, title: "Read 20 pages", cells: ["done", "done", "done", "missed", "done", "done", "done"], streak: 3, prev_done: 5, prev_planned: 7 },
    { id: 4, title: "Drink 3L water", cells: ["done", "done", "done", "done", "done", "missed", "missed"], streak: 0, prev_done: 4, prev_planned: 7 },
    { id: 5, title: "Gym session", cells: ["none", "done", "none", "missed", "none", "done", "done"], streak: 2, prev_done: 3, prev_planned: 4 },
    { id: 6, title: "Meditate", cells: ["done", "missed", "done", "done", "missed", "done", "missed"], streak: 0, prev_done: 6, prev_planned: 7 },
    { id: 7, title: "No phone after 10pm", cells: ["missed", "missed", "done", "missed", "done", "missed", "done"], streak: 1, prev_done: 2, prev_planned: 7 },
  ],
  priorities: [
    { priority: "highest", done: 5, total: 9 },
    { priority: "high", done: 6, total: 8 },
    { priority: "medium", done: 7, total: 8 },
    { priority: "low", done: 4, total: 5 },
  ],
  top_priority_misses: [
    "Prepare Q4 review deck",
    "Send investor update",
    "Finish API documentation",
    "Book dentist appointment",
  ],
  time_slots: [
    { id: "morning", done: [4, 5, 6, 2, 4, 3, 2], planned: [4, 5, 6, 4, 4, 4, 3] },
    { id: "afternoon", done: [2, 2, 3, 1, 2, 2, 1], planned: [3, 3, 3, 2, 3, 3, 2] },
    { id: "evening", done: [1, 1, 2, 0, 2, 2, 1], planned: [2, 2, 2, 3, 2, 3, 2] },
    { id: "night", done: [1, 1, 0, 1, 1, 1, 1], planned: [1, 1, 0, 1, 1, 1, 1] },
  ],
  most_missed: [
    { id: 1, title: "No phone after 10pm", kind: "habit", misses: 4, note: "Kept scrolling in bed after long days." },
    { id: 2, title: "Meditate", kind: "habit", misses: 3, note: "Skipped on the busy mornings." },
    { id: 3, title: "Prepare Q4 review deck", kind: "task", misses: 2, note: null },
  ],
  goals: [
    {
      id: 1, title: "Run a half marathon", milestone_title: "Build 15 km base",
      alignment_pct: 84, prev_alignment_pct: 71,
      daily_pct: [60, 72, 85, 70, 88, 92, 90],
      milestone_done: 9, milestone_total: 12, milestone_done_prev_week: 6,
    },
    {
      id: 2, title: "Ship the v2 launch", milestone_title: "Beta feedback loop",
      alignment_pct: 62, prev_alignment_pct: 70,
      daily_pct: [75, 60, 80, 35, 70, 55, 40],
      milestone_done: 14, milestone_total: 22, milestone_done_prev_week: 12,
    },
    {
      id: 3, title: "Read 24 books this year", milestone_title: "Books 14 to 16",
      alignment_pct: 90, prev_alignment_pct: 90,
      daily_pct: [88, 92, 90, null, 91, 89, 90],
      milestone_done: 5, milestone_total: 6, milestone_done_prev_week: 4,
    },
  ],
  focus: {
    title: "Protect your evenings",
    rationale:
      "Evening items were finished 56% of the time versus 87% for mornings. Moving your two lowest-priority evening tasks to the morning could lift next week's score by around 8 points.",
    metric_label: "Evening completion",
    current_pct: 56,
    target_pct: 70,
  },
};
