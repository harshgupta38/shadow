import type { ExerciseKind, WorkoutEquipment, WorkoutLevel } from "@/api";
import { FilterDropdown } from "@/components/ui/FilterDropdown/FilterDropdown";
import {
  DEFAULT_EXERCISE_FILTERS,
  hasActiveFilters,
  type ExerciseFilters,
} from "@/pages/workout/ExerciseFilterBar/exerciseFilters";
import { SearchBox } from "@/pages/workout/SearchBox/SearchBox";
import { EQUIPMENT_OPTIONS, KIND_OPTIONS, LEVEL_OPTIONS, MUSCLE_GROUPS } from "@/pages/workout/WorkoutPage.constants";
import "./ExerciseFilterBar.scss";

interface ExerciseFilterBarProps {
  filters: ExerciseFilters;
  onChange: (next: ExerciseFilters) => void;
  /** Shown beside the controls, e.g. "42 exercises". */
  resultLabel?: string;
}

// "All" plus each muscle group, in the shape the Filters dropdown takes.
const GROUP_OPTIONS = [{ value: "all", label: "All" }, ...MUSCLE_GROUPS.map((g) => ({ value: g.id, label: g.label }))];

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ExerciseFilterBar({ filters, onChange, resultLabel }: ExerciseFilterBarProps) {
  const active = hasActiveFilters(filters);

  return (
    <div className="wk-filter">
      <div className="wk-filter-row">
        <SearchBox
          value={filters.query}
          onChange={(query) => onChange({ ...filters, query })}
          placeholder="Search exercises or muscles"
          label="Search exercises"
        />

        <FilterDropdown
          label="Filters"
          width={280}
          onReset={() => onChange({ ...DEFAULT_EXERCISE_FILTERS, query: filters.query, muscle: filters.muscle })}
          sections={[
            {
              key: "group",
              label: "Muscle group",
              options: GROUP_OPTIONS,
              selected: [filters.group],
              single: true,
              onToggle: (v) => onChange({ ...filters, group: v, muscle: null }),
            },
            {
              key: "kind",
              label: "Kind",
              options: KIND_OPTIONS,
              selected: filters.kinds,
              onToggle: (v) => onChange({ ...filters, kinds: toggle(filters.kinds, v as ExerciseKind) }),
            },
            {
              key: "equipment",
              label: "Equipment",
              options: EQUIPMENT_OPTIONS,
              selected: filters.equipment,
              onToggle: (v) => onChange({ ...filters, equipment: toggle(filters.equipment, v as WorkoutEquipment) }),
            },
            {
              key: "level",
              label: "Level",
              options: LEVEL_OPTIONS,
              selected: filters.level,
              onToggle: (v) => onChange({ ...filters, level: toggle(filters.level, v as WorkoutLevel) }),
            },
          ]}
        />

        {active && resultLabel && <span className="wk-filter-count">{resultLabel}</span>}
        {active && (
          <button type="button" className="wk-filter-clear" onClick={() => onChange(DEFAULT_EXERCISE_FILTERS)}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
