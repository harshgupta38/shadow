// Mock data for the Dashboard design pass — no backend endpoint exists yet.
// Shaped to exactly match DashboardResponse so swapping in the real fetch later
// is a one-line change, not a widget rewrite.

import { todayDate } from "@/services/date.service";
import { TODAY_COL } from "@/pages/track_progress/TrackProgressPage.constants";
import type { DayReport } from "@/api";
import type { DashboardResponse, WeeklyMatrixRow } from "@/api";

function isoOffset(days: number): string {
  const today = todayDate();
  const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// ─── This month's calendar rollup ───────────────────────────────────────────────

// Deterministic score pattern (not random) so the heatmap looks the same on every render.
const SCORE_PATTERN: (number | null)[] = [
  62, 78, 45, 88, 91, null, 70, 85, 55, 95,
  40, 75, 82, 60, null, 88, 92, 66, 74, 58,
  80, 44, 90, 68, 77, 52, 86, 63, 71, 95, 40,
];

function buildMockMonthDays(): DayReport[] {
  const today = todayDate();
  const daysSoFar = today.getDate();
  const days: DayReport[] = [];

  for (let d = 1; d <= daysSoFar; d++) {
    const isToday = d === daysSoFar;
    const score = isToday ? null : SCORE_PATTERN[(d - 1) % SCORE_PATTERN.length];
    const hasReport = !isToday && score !== null && d % 3 !== 0;
    const habitsTotal = 3;
    const tasksTotal = 4;
    const ratio = score !== null ? score / 100 : 0;

    days.push({
      date: isoOffset(d - daysSoFar),
      score,
      alignment_score: hasReport ? score : null,
      habits_total: habitsTotal,
      habits_done: Math.round(ratio * habitsTotal),
      tasks_total: tasksTotal,
      tasks_done: Math.round(ratio * tasksTotal),
      schedule_total: 1,
      schedule_done: score !== null && score > 50 ? 1 : 0,
      has_daily_report: hasReport,
      has_weekly_report: !isToday && d % 7 === 6,
    });
  }
  return days;
}

// ─── This week (habit tracking) ─────────────────────────────────────────────────

// Days after today are always false — the week hasn't happened yet, so mock
// data shouldn't claim it did.
function weekPattern(doneDays: number[]): boolean[] {
  return Array.from({ length: 7 }, (_, i) => doneDays.includes(i) && i <= TODAY_COL);
}

const MOCK_WEEK_HABITS: WeeklyMatrixRow[] = [
  { id: 1, title: "Morning Run", week: weekPattern([1, 2]) },
  { id: 2, title: "Read 30 Minutes", week: weekPattern([0, 1]) },
  { id: 3, title: "No Junk Food", week: weekPattern([0, 1, 2]) },
  { id: 4, title: "Hydrate", week: weekPattern([0, 2]) },
];

// ─── Single mock response ────────────────────────────────────────────────────────

export const MOCK_DASHBOARD_DATA: DashboardResponse = {
  today_items: [
    {
      plan_id: 101, source_type: "habit", title: "Morning Run — 5km",
      planner_type: "metric", planner_target: 5, value_unit: "km",
      priority: "high", preferred_time: "morning", specific_time: null,
      goal_summary: "Train consistently to complete a 21km run in under two hours.",
      status: "done", current_value: 5, current_streak: 6,
    },
    {
      plan_id: 102, source_type: "task", title: "Finish budgeting app onboarding flow",
      planner_type: "simple", planner_target: null, value_unit: null,
      priority: "highest", preferred_time: "flexible", specific_time: null,
      goal_summary: "Build and launch a budgeting app to develop full-stack skills and side income.",
      status: "due", current_value: 0, current_streak: 0,
    },
    {
      plan_id: 103, source_type: "habit", title: "Read for 30 minutes",
      planner_type: "metric", planner_target: 30, value_unit: "min",
      priority: "medium", preferred_time: "evening", specific_time: null,
      goal_summary: "Build a consistent reading habit across fiction and non-fiction.",
      status: "due", current_value: 10, current_streak: 2,
    },
    {
      plan_id: 104, source_type: "habit", title: "Review a teammate's PR",
      planner_type: "simple", planner_target: null, value_unit: null,
      priority: "medium", preferred_time: "afternoon", specific_time: null,
      goal_summary: "Take ownership of a major project and mentor two junior engineers.",
      status: "done", current_value: 0, current_streak: 8,
    },
    {
      plan_id: 105, source_type: "schedule", title: "Team 1:1 with manager",
      planner_type: "simple", planner_target: null, value_unit: null,
      priority: "high", preferred_time: "custom", specific_time: "15:30",
      goal_summary: null,
      status: "due", current_value: 0, current_streak: 0,
    },
  ],

  latest_report: {
    date: isoOffset(-1),
    report_type: "daily",
    generated_at: `${isoOffset(-1)}T18:25:00`,
    alignment_score: 78,
    headline: "Strong momentum on Career and Fitness today.",
    summary: "You closed out 4 of 5 planned items with high consistency on your morning routine. Business work lagged slightly behind schedule, but overall alignment stayed solid across active goals.",
    stats: { tasks_done: 3, tasks_total: 4, habits_done: 3, habits_total: 3, best_streak: 9 },
    goals: [
      { id: 2, title: "Run a Half Marathon", alignment_pct: 88, milestone_title: "Build weekly mileage", note: "Consistent training keeps the half-marathon goal on track.", tasks_done: 1, tasks_total: 1 },
      { id: 3, title: "Get Promoted to Senior Engineer", alignment_pct: 80, milestone_title: "Lead the Q3 migration project", note: "Steady contribution — consider taking more visible ownership soon.", tasks_done: 1, tasks_total: 1 },
      { id: 4, title: "Read 24 Books This Year", alignment_pct: 65, milestone_title: "Finish current book", note: "On pace, but a longer session would help catch up.", tasks_done: 1, tasks_total: 1 },
      { id: 1, title: "Ship the Personal Finance Tracker", alignment_pct: 52, milestone_title: "Complete onboarding flow", note: "Progress slowed today — protect focus time this week.", tasks_done: 0, tasks_total: 1 },
    ],
    highlights: {
      good: ["Completed the full 5km run without missing pace targets.", "Reviewed a teammate's PR before noon."],
      attention: ["Budgeting app onboarding flow slipped for the second day."],
    },
    closing: { tone: "motivate", message: "Keep the morning routine steady — it's carrying your best streak right now." },
  },

  month_days: buildMockMonthDays(),

  goals: [
    {
      id: 1, position: 1, title: "Ship the Personal Finance Tracker",
      summary: "Build and launch a budgeting app to develop full-stack skills and side income.",
      category: "Business", status: "Active", target_date: "2026-12-01",
      milestones_total: 5, milestones_completed: 3, habits_total: 2, habits_active: 2,
    },
    {
      id: 2, position: 2, title: "Run a Half Marathon",
      summary: "Train consistently to complete a 21km run in under two hours.",
      category: "Fitness", status: "Active", target_date: "2026-11-15",
      milestones_total: 4, milestones_completed: 1, habits_total: 3, habits_active: 3,
    },
    {
      id: 3, position: 3, title: "Get Promoted to Senior Engineer",
      summary: "Take ownership of a major project and mentor two junior engineers.",
      category: "Career", status: "Active", target_date: "2027-03-01",
      milestones_total: 6, milestones_completed: 4, habits_total: 1, habits_active: 1,
    },
    {
      id: 4, position: 4, title: "Read 24 Books This Year",
      summary: "Build a consistent reading habit across fiction and non-fiction.",
      category: "Personal Growth", status: "Active", target_date: "2026-12-31",
      milestones_total: 2, milestones_completed: 0, habits_total: 1, habits_active: 1,
    },
  ],

  upcoming: [
    { id: 201, title: "Dentist appointment", scheduled_date: isoOffset(1), priority: "high", note: "Bring the old X-ray reports." },
    { id: 202, title: "Submit visa document scans", scheduled_date: isoOffset(2), priority: "highest", note: null },
    { id: 203, title: "Call parents", scheduled_date: isoOffset(2), priority: "medium", note: null },
    { id: 204, title: "Renew car insurance", scheduled_date: isoOffset(4), priority: "low", note: "Compare quotes before renewing — last year's premium felt high." },
  ],

  week_habits: MOCK_WEEK_HABITS,
};
