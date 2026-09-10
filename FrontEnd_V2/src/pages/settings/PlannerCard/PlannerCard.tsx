import { CalendarWeekFill } from "react-bootstrap-icons";
import type { DateFormat, PlannerSettings, TimeFormat, WeekStartsOn } from "@/api";
import { Card, FieldRow, SegmentedControl } from "@/pages/settings/SettingsShared";
import "@/pages/settings/PlannerCard/PlannerCard.scss";

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
  { value: "mm/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "dd-mm-yyyy", label: "DD-MM-YYYY" },
  { value: "mm-dd-yyyy", label: "MM-DD-YYYY" },
  { value: "mmm d yyyy", label: "MMM D, YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
];

export function PlannerCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: PlannerSettings;
  isDirty: boolean;
  onUpdate: (d: PlannerSettings) => void;
}) {
  function set<K extends keyof PlannerSettings>(key: K, value: PlannerSettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  function adjustDuration(delta: number) {
    const next = Math.max(5, Math.min(480, data.default_task_duration_minutes + delta));
    set("default_task_duration_minutes", next);
  }

  return (
    <Card
      className="planner-card"
      icon={<CalendarWeekFill size={16} />}
      title="Planner Defaults"
      desc="Set your scheduling defaults and preferred display formats."
      isDirty={isDirty}
    >
      <div className="st-block-field">
        <span className="st-field-label">Week starts on</span>
        <SegmentedControl<WeekStartsOn>
          options={[
            { value: "monday", label: "Monday" },
            { value: "sunday", label: "Sunday" },
          ]}
          value={data.week_starts_on}
          onChange={(v) => set("week_starts_on", v)}
        />
      </div>

      <div className="st-block-field">
        <span className="st-field-label">Time format</span>
        <SegmentedControl<TimeFormat>
          options={[
            { value: "12h", label: "12-hour" },
            { value: "24h", label: "24-hour" },
          ]}
          value={data.time_format}
          onChange={(v) => set("time_format", v)}
        />
      </div>

      <FieldRow label="Date format" hint="How dates appear across Shadow">
        <select
          className="form-select form-select-sm st-select"
          value={data.date_format}
          onChange={(e) => set("date_format", e.target.value as DateFormat)}
          aria-label="Date format"
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldRow>

      <FieldRow label="Default reminder time" hint="When task reminders fire by default">
        <input
          type="time"
          className="form-control form-control-sm st-time-input"
          value={data.default_reminder_time}
          onChange={(e) => set("default_reminder_time", e.target.value)}
          aria-label="Default reminder time"
        />
      </FieldRow>

      <FieldRow label="Default task duration" hint="Assumed length when creating a new task" className="pb-0">
        <div className="st-stepper">
          <button
            type="button"
            className="st-stepper-btn"
            aria-label="Decrease duration"
            onClick={() => adjustDuration(-5)}
            disabled={data.default_task_duration_minutes <= 5}
          >
            −
          </button>
          <span className="st-stepper-value">{data.default_task_duration_minutes} min</span>
          <button
            type="button"
            className="st-stepper-btn"
            aria-label="Increase duration"
            onClick={() => adjustDuration(5)}
            disabled={data.default_task_duration_minutes >= 480}
          >
            +
          </button>
        </div>
      </FieldRow>
    </Card>
  );
}
