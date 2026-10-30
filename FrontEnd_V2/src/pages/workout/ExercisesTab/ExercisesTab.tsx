import { useLayoutEffect, useMemo, useState } from "react";
import { Search } from "react-bootstrap-icons";

import type { MuscleId } from "@/api/types";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { ExerciseCard } from "@/pages/workout/ExercisesTab/ExerciseCard/ExerciseCard";
import { MusclePicker } from "@/pages/workout/ExercisesTab/MusclePicker/MusclePicker";
import { ExerciseFilterBar } from "@/pages/workout/ExerciseFilterBar/ExerciseFilterBar";
import {
  DEFAULT_EXERCISE_FILTERS,
  applyExerciseFilters,
  type ExerciseFilters,
} from "@/pages/workout/ExerciseFilterBar/exerciseFilters";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { MUSCLE_LABEL, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { useExerciseLibrary } from "@/pages/workout/useExerciseLibrary";
import "./ExercisesTab.scss";

// The picker covers the last PICKER_COLUMNS columns of the first PICKER_ROWS rows.
const PICKER_COLUMNS = 2;
const PICKER_ROWS = 2;
const ROWS_PER_PAGE = 4;

// Every muscle as a chip: front-facing first, then back-facing, in the order they sit on the body.
const MUSCLE_CHIPS: MuscleId[] = [
  "chest", "shoulders", "biceps", "forearms", "abs", "obliques", "quads",
  "traps", "lats", "triceps", "lower_back", "glutes", "hamstrings", "calves",
];

interface ExercisesTabProps {
  onOpenExercise: (id: number) => void;
}

export function ExercisesTab({ onOpenExercise }: ExercisesTabProps) {
  const { exercises, loading, error, reload } = useExerciseLibrary();
  const [filters, setFilters] = useState<ExerciseFilters>(DEFAULT_EXERCISE_FILTERS);
  const [rows, setRows] = useState(ROWS_PER_PAGE);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(0);

  const results = useMemo(() => applyExerciseFilters(exercises, filters), [exercises, filters]);

  // Cards beside the picker fill its rows first. Each page then ends on a whole row, so no row is left short.
  const wide = columns > PICKER_COLUMNS;
  const beside = wide ? (columns - PICKER_COLUMNS) * PICKER_ROWS : 0;
  const visible = beside + columns * rows;

  // The column count depends on the width, so read it back from the grid whenever the grid resizes.
  useLayoutEffect(() => {
    if (!grid) return;
    const measure = () => setColumns(getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid]);

  function changeFilters(next: ExerciseFilters) {
    setFilters(next);
    setRows(ROWS_PER_PAGE);
  }

  // Picking the muscle that is already picked clears it. A muscle is narrower than a group tab, so it resets the group.
  function pickMuscle(muscle: MuscleId) {
    changeFilters({ ...filters, muscle: filters.muscle === muscle ? null : muscle, group: "all" });
  }

  if (error) return <IllustratedErrorState onRetry={() => void reload()} />;

  const noResults = !loading && results.length === 0;

  return (
    <div className="wk-ex-tab">
      <ExerciseFilterBar
        filters={filters}
        onChange={changeFilters}
        resultLabel={loading ? undefined : pluralize(results.length, "exercise")}
      />

      <div className="wk-ex-muscles" role="group" aria-label="Muscles">
        {MUSCLE_CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            className={`wk-group${filters.muscle === m ? " is-active" : ""}`}
            aria-pressed={filters.muscle === m}
            onClick={() => pickMuscle(m)}
          >
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>

      {/* The picker takes the top-right corner, so the cards wrap around it the way text wraps around a picture. */}
      <div ref={setGrid} className={`wk-ex-grid${wide ? "" : " is-narrow"}`}>
        <MusclePicker
          selected={filters.muscle}
          onSelect={pickMuscle}
          onClear={() => changeFilters({ ...filters, muscle: null })}
        />

        {loading ? (
          Array.from({ length: visible }, (_, i) => <Skeleton key={i} className="wk-ex-skel" />)
        ) : noResults ? (
          <div className="empty-state surface wk-ex-empty">
            <div className="empty-icon mx-auto mb-3"><Search size={24} /></div>
            <h2 className="h6 fw-bold">No exercises match</h2>
            <p className="mb-3">Try a different muscle or clear some filters.</p>
            <button type="button" className="btn btn-soft" onClick={() => changeFilters(DEFAULT_EXERCISE_FILTERS)}>
              Clear filters
            </button>
          </div>
        ) : (
          results.slice(0, visible).map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} onOpen={(e) => onOpenExercise(e.id)} />
          ))
        )}
      </div>

      {!loading && visible < results.length && (
        <div className="text-center">
          <button type="button" className="btn btn-soft px-4" onClick={() => setRows((r) => r + ROWS_PER_PAGE)}>
            Show more ({results.length - visible} left)
          </button>
        </div>
      )}
    </div>
  );
}
