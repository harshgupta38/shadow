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

function Card({ title, chip, children }: { title: string; chip?: string; children: ReactNode }) {
  return (
    <section className="wi-card">
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

  return (
    <div className="wi">
      <div className="rdp-section-head">
        <h2 className="rdp-section-title">Week in depth</h2>
        <span
          className="wi-preview-chip"
          title="Illustrative numbers. Weekly insights are not connected to your account data yet."
        >
          Preview data
        </span>
      </div>

      <div className="wi-grid wi-grid--chart-side">
        <Card title="Week rhythm" chip="Sun to Sat">
          <WeekRhythm days={data.days} labels={labels} />
        </Card>
        <Card title="Versus last week">
          <VsLastWeek comparison={data.comparison} scoreTrend={data.score_trend} labels={labels} />
        </Card>
      </div>

      <div className="wi-grid wi-grid--wide-narrow">
        <Card title="Habit consistency" chip={`${data.habits.length} habits`}>
          <HabitConsistency habits={data.habits} labels={labels} />
        </Card>
        <Card title="Priority follow-through" chip="tasks by priority">
          <PriorityFollowThrough tiers={data.priorities} topMisses={data.top_priority_misses} />
        </Card>
      </div>

      <div className="wi-grid wi-grid--wide-narrow">
        <Card title="When you get things done" chip="completed items">
          <TimeHeatmap slots={data.time_slots} labels={labels} />
        </Card>
        <Card title="Most missed" chip="your own notes">
          <MostMissed items={data.most_missed} />
        </Card>
      </div>

      <Card title="Goal momentum" chip={`${data.goals.length} goals`}>
        <GoalMomentum goals={data.goals} labels={labels} />
      </Card>

      <NextWeekFocus focus={data.focus} />
    </div>
  );
}
