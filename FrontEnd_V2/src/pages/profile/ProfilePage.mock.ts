import type { ProfileResponse } from "@/api";

// Stand-in for `GET /profile` until the backend endpoint exists. Shaped
// exactly like the real ProfileResponse so swapping this for a fetch call
// later is a one-line change in ProfilePage.tsx.
export const MOCK_PROFILE: ProfileResponse = {
  bio: null,
  joined_at: "2025-11-03",
  email_verified: false,

  streak_days: 12,
  goals_completed: 3,
  habits_active: 6,
  tasks_completed_total: 184,

  month_alignment_percent: 78,
  month_goals_done: 4,
  month_goals_total: 5,
  month_habits_done: 5,
  month_habits_total: 6,
  month_tasks_done: 21,
  month_tasks_total: 27,

  achievements: [
    // System-wide — same rules for every user.
    { key: "first-goal", label: "First Goal", hint: "Completed your first goal", icon: "Award", unlocked: true },
    { key: "week-streak", label: "7-Day Streak", hint: "Stayed consistent for a week", icon: "Fire", unlocked: true },
    { key: "habit-builder", label: "Habit Builder", hint: "Tracking 5+ active habits", icon: "SunriseFill", unlocked: true },
    { key: "century-club", label: "Century Club", hint: "Completed 100 tasks", icon: "TrophyFill", unlocked: true },
    { key: "month-streak", label: "30-Day Streak", hint: "A full month, no gaps", icon: "LightningChargeFill", unlocked: false },
    { key: "early-riser", label: "Early Riser", hint: "Complete a task before 8 AM", icon: "CupHotFill", unlocked: false },
    { key: "reflection-pro", label: "Reflection Pro", hint: "Read 10 weekly reports", icon: "JournalText", unlocked: false },
    { key: "consistency-king", label: "Consistency King", hint: "90%+ alignment for 30 days", icon: "StarFill", unlocked: false },
    { key: "milestone-master", label: "Milestone Master", hint: "Completed 10 milestones", icon: "Diagram3", unlocked: false },
    { key: "goal-crusher", label: "Goal Crusher", hint: "Completed 5 goals", icon: "RocketTakeoffFill", unlocked: false },
    { key: "scheduler-pro", label: "Scheduler Pro", hint: "Completed 20 scheduled tasks", icon: "CalendarEvent", unlocked: false },
    { key: "planner-pro", label: "Planner Pro", hint: "Followed Today's Plan 14 days straight", icon: "ClipboardCheck", unlocked: false },
    { key: "career-climber", label: "Career Climber", hint: "Chatted with the Career Advisor 5 times", icon: "BriefcaseFill", unlocked: false },
    { key: "ai-confidant", label: "AI Confidant", hint: "Reached 25 conversations with Shadow", icon: "ChatDotsFill", unlocked: false },
    { key: "habit-variety", label: "Habit Variety", hint: "Built habits across 5 focus areas", icon: "Grid3x3GapFill", unlocked: false },
    { key: "on-target", label: "On Target", hint: "Kept monthly alignment above 75%", icon: "Bullseye", unlocked: true },

    // Personal — one per habit this user actually created, tinted with that
    // habit's own category color. A different user's habits => different tiles.
    { key: "habit-1", label: "Morning Run", hint: "45-day streak", icon: "Fire", unlocked: true, tone: "warn" },
    { key: "habit-2", label: "Read 20 Pages", hint: "12-day streak", icon: "Fire", unlocked: false, tone: "info" },
    { key: "habit-3", label: "Drink 3L Water", hint: "60-day streak", icon: "Fire", unlocked: true, tone: "success" },
    { key: "habit-4", label: "Meditate 10 Min", hint: "5-day streak", icon: "Fire", unlocked: false, tone: "violet" },
    { key: "habit-5", label: "No Sugar", hint: "21-day streak", icon: "Fire", unlocked: true, tone: "brand" },

    // Personal — one per goal this user actually created.
    { key: "goal-1", label: "Learn Spanish", hint: "15 tasks completed", icon: "FlagFill", unlocked: true, tone: "brand" },
    { key: "goal-2", label: "Ship Side Project", hint: "22 tasks completed", icon: "FlagFill", unlocked: true, tone: "brand" },
    { key: "goal-3", label: "Run a 10K", hint: "6 tasks completed", icon: "FlagFill", unlocked: false, tone: "brand" },
  ],
};
