import { useState } from "react";
import { HeartPulseFill, PlusLg } from "react-bootstrap-icons";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";
import { ExerciseDetailModal } from "@/pages/workout/ExerciseDetailModal/ExerciseDetailModal";
import { ExercisesTab } from "@/pages/workout/ExercisesTab/ExercisesTab";
import { HistoryTab } from "@/pages/workout/HistoryTab/HistoryTab";
import { PlansTab } from "@/pages/workout/PlansTab/PlansTab";
import { TodayTab } from "@/pages/workout/TodayTab/TodayTab";
import "./WorkoutPage.scss";

type TabId = "today" | "plans" | "exercises" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "plans", label: "Plans" },
  { id: "exercises", label: "Exercises" },
  { id: "history", label: "History" },
];

export function WorkoutPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [exerciseId, setExerciseId] = useState<number | null>(null);

  // The tab lives in the URL so a refresh, a back button, or a link from another page lands on the right one.
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "today";
  const selectTab = (id: TabId) => setParams(id === "today" ? {} : { tab: id }, { replace: true });

  return (
    <div className="wk-shell">
      <PageHeader
        title="Workout"
        subtitle="Build a routine you can actually stick to."
        icon={<HeartPulseFill />}
        actions={[
          { key: "new-plan", label: "New plan", icon: <PlusLg size={14} />, tone: "brand", onClick: () => navigate(ROUTES.WORKOUT_PLAN_CREATE) },
        ]}
      />

      <div className="wk-shell-tabs">
        <div className="nav-tabs-jv" role="tablist" aria-label="Workout sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`wk-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="wk-tabpanel"
              className={`nav-tab-jv${tab === t.id ? " active" : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="wk-tabpanel" role="tabpanel" aria-labelledby={`wk-tab-${tab}`}>
        {tab === "today" && <TodayTab onOpenExercise={setExerciseId} />}
        {tab === "plans" && <PlansTab />}
        {tab === "exercises" && <ExercisesTab onOpenExercise={setExerciseId} />}
        {tab === "history" && <HistoryTab />}
      </div>

      <ExerciseDetailModal exerciseId={exerciseId} onClose={() => setExerciseId(null)} />
    </div>
  );
}
