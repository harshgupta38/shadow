export type ColorKey = "success" | "info" | "brand" | "warn" | "violet";

export interface MetricHabitData {
  id: number;
  title: string;
  value_unit: string;
  planner_target: number;
  current_streak: number;
  max_streak: number;
  category: string;
  /** 28 entries: index 0 = 27 days ago, index 27 = today */
  history: number[];
  color: ColorKey;
}

export interface SimpleHabitData {
  id: number;
  title: string;
  current_streak: number;
  max_streak: number;
  category: string;
  /** 28 entries: index 0 = 28 days ago, index 27 = yesterday */
  history: boolean[];
  done_today: boolean;
  color: ColorKey;
}
