export interface PlanFeature {
  name: string;
  hint: string;
}

/**
 * What each paid plan adds, by plan code. Every plan also includes everything in the plans below it, so a list only holds
 * what is new. Shown on the plans page only: nothing in the app is gated by plan yet.
 */
export const PLAN_FEATURES: Record<string, PlanFeature[]> = {
  starter: [
    { name: "Today's plan", hint: "Habits, tasks and schedule for each day, with streaks" },
    { name: "Schedule", hint: "One-off and yearly tasks, as a calendar or a list" },
    { name: "Goals, milestones and tasks", hint: "Break big goals into steps and track progress" },
    { name: "Habit library", hint: "Checkbox or numeric-target habits on your own rhythm" },
    { name: "Track progress", hint: "Weekly habit and task matrix with streaks" },
    { name: "Journal", hint: "A daily entry with rich text and your mood" },
    { name: "Dashboard", hint: "Your day, goals and reports at a glance" },
    { name: "Reminders", hint: "In-app, live and web push, plus email reminders and reports" },
    { name: "Daily and weekly reports", hint: "Alignment score, highlights and a closing note" },
    { name: "Daily brief", hint: "A written briefing on the day ahead" },
    { name: "Shadow chat", hint: "Your everyday AI life coach" },
    { name: "Goal coach", hint: "Drafts goals, milestones and tasks for you to save" },
    { name: "AI goal drafting", hint: "Turns a few answers into a ready goal" },
    { name: "Your choice of AI", hint: "Pick the model, or bring your own key" },
  ],
  plus: [
    { name: "Exercise library", hint: "900+ exercises with photos and warm-ups" },
    { name: "Workout plans", hint: "Ready-made plans, or build your own" },
    { name: "Workout sessions", hint: "Log sets with a rest timer and alarm, and see progress" },
    { name: "Diet targets", hint: "Daily calories and macros from your body details" },
    { name: "Food library", hint: "Search the food list or add your own foods" },
    { name: "Food diary", hint: "Meals, saved meals and a water log" },
    { name: "Nutrition history", hint: "Day-by-day scores and trends" },
    { name: "Log meals by typing", hint: "Describe a meal and review it before saving" },
    { name: "Meal ideas", hint: "Suggestions built from your food library" },
    { name: "Weekly insights", hint: "The week in depth, inside your weekly report" },
  ],
  pro: [
    { name: "Career advisor", hint: "AI coaching for your career decisions" },
    { name: "Insights coach", hint: "AI that finds patterns across your data" },
    { name: "Diet coach", hint: "Chat with an AI that sees your nutrition data" },
    { name: "Daily brief audio", hint: "A spoken brief with live captions" },
    { name: "Assistant memory", hint: "Remembers your preferences across chats" },
  ],
};

/** A price in paise, as rupees with Indian digit grouping. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
