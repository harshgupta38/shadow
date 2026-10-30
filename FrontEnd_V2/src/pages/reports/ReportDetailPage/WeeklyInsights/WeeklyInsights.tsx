import type { ReactNode } from "react";

import type { WeeklyInsights as WeeklyInsightsData } from "@/api/types";
import { GoalMomentum } from "./GoalMomentum/GoalMomentum";
import { HabitConsistency } from "./HabitConsistency/HabitConsistency";
import { MostMissed } from "./MostMissed/MostMissed";
import { NextWeekFocus } from "./NextWeekFocus/NextWeekFocus";
import { PriorityFollowThrough } from "./PriorityFollowThrough/PriorityFollowThrough";
import { TimeHeatmap } from "./TimeHeatmap/TimeHeatmap";
import { VsLastWeek } from "./VsLastWeek/VsLastWeek";
import { WeekRhythm } from "./WeekRhythm/WeekRhythm";
import { useWeekLabels } from "./useWeekLabels";
import "./WeeklyInsights.scss";

interface WeeklyInsightsProps {
  data: WeeklyInsightsData;
  weekEnd: string; // Saturday the weekly report is dated
}

interface CardProps {
  title: string;
  chip?: string;
  order?: number; // reading order inside the columns, applied when they collapse into one on narrow screens
  children: ReactNode;
}

function Card({ title, chip, order, children }: CardProps) {
  return (
    <section className="wi-card" style={{ order }}>
      <header className="wi-card-head">
        <h3 className="wi-card-title">{title}</h3>
        {chip && <span className="wi-chip">{chip}</span>}
      </header>
      {children}
    </section>
  );
}

export function WeeklyInsights({ data, weekEnd }: WeeklyInsightsProps) {
  const labels = useWeekLabels(weekEnd);
  // A card with nothing to show is dropped; its column simply flows up.
  const hasHabits = data.habits.length > 0;
  const hasSlots = data.time_slots.length > 0;

  return (
    <div className="wi">
      <div className="rdp-section-head">
        <h2 className="rdp-section-title">Week in depth</h2>
      </div>

      {/* Two independent columns: a card growing (e.g. expanding the habit list) never
          stretches or shifts a card in the other column. */}
      <div className="wi-cols">
        <div className="wi-col">
          <Card order={1} title="Week rhythm" chip="Sun to Sat">
            <WeekRhythm days={data.days} labels={labels} />
          </Card>
          {hasHabits && (
            <Card order={3} title="Habit consistency" chip={`${data.habits.length} habits`}>
              <HabitConsistency habits={data.habits} labels={labels} />
            </Card>
          )}
          {hasSlots && (
            <Card order={5} title="When you get things done" chip="by planned time">
              <TimeHeatmap slots={data.time_slots} unslottedCount={data.unslotted_count} labels={labels} />
            </Card>
          )}
        </div>

        <div className="wi-col">
          <Card order={2} title="Versus last week">
            <VsLastWeek comparison={data.comparison} scoreTrend={data.score_trend} labels={labels} />
          </Card>
          <Card order={4} title="Priority follow-through" chip="all planned items">
            <PriorityFollowThrough tiers={data.priorities} topMisses={data.top_priority_misses} />
          </Card>
          <Card order={6} title="Most missed" chip="your own notes">
            <MostMissed items={data.most_missed} />
          </Card>
        </div>
      </div>

      {data.goals.length > 0 && (
        <Card title="Goal momentum" chip={`${data.goals.length} goals`}>
          <GoalMomentum goals={data.goals} labels={labels} />
        </Card>
      )}

      <NextWeekFocus focus={data.focus} />
    </div>
  );
}
