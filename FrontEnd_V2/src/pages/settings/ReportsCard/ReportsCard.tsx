import { FileEarmarkBarGraphFill } from "react-bootstrap-icons";
import type { ReportScheduleSettings, ReportsSettings } from "@/api";
import { Card, FieldRow, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/ReportsCard/ReportsCard.scss";

// The backend/scheduler works in "HHMM" (24h, IST — matches REPORT_DAILY_RUNTIME's
// env-var convention); <input type="time"> speaks "HH:MM". Convert at the boundary.
function hhmmToColon(hhmm: string): string {
  if (!/^\d{4}$/.test(hhmm)) return "23:55";
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

function colonToHhmm(colon: string): string {
  return colon.replace(":", "");
}

function ScheduleSection({
  title,
  toggleLabel,
  toggleHint,
  data,
  onChange,
}: {
  title: string;
  toggleLabel: string;
  toggleHint: string;
  data: ReportScheduleSettings;
  onChange: (d: ReportScheduleSettings) => void;
}) {
  function set<K extends keyof ReportScheduleSettings>(key: K, value: ReportScheduleSettings[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="st-toggle-group">
      <span className="st-group-label">{title}</span>

      <ToggleRow
        label={toggleLabel}
        description={toggleHint}
        checked={data.enabled}
        onChange={(v) => set("enabled", v)}
        className={data.enabled ? "pt-1 pb-1" : "pb-2 pt-1"}
      />

      {data.enabled && (
        <>
          <FieldRow label="Generate at" hint="Time of day, IST">
            <input
              type="time"
              className="form-control form-control-sm st-time-input"
              value={hhmmToColon(data.time)}
              onChange={(e) => set("time", colonToHhmm(e.target.value))}
              aria-label={`${title} generation time`}
            />
          </FieldRow>
          <ToggleRow
            label="Email me when ready"
            description="Send this report to your inbox right after it's generated."
            checked={data.email_enabled}
            onChange={(v) => set("email_enabled", v)}
            className="pb-0"
          />
        </>
      )}
    </div>
  );
}

export function ReportsCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: ReportsSettings;
  isDirty: boolean;
  onUpdate: (d: ReportsSettings) => void;
}) {
  return (
    <Card
      className="reports-card"
      icon={<FileEarmarkBarGraphFill size={16} />}
      title="Reports"
      desc="Control if and when your daily and weekly reports are generated."
      isDirty={isDirty}
    >
      <ScheduleSection
        title="Daily report"
        toggleLabel="Auto-generate daily report"
        toggleHint="A short recap of today, generated automatically."
        data={data.daily}
        onChange={(d) => onUpdate({ ...data, daily: d })}
      />
      <ScheduleSection
        title="Weekly report"
        toggleLabel="Auto-generate weekly report"
        toggleHint="A summary of your week, generated every Saturday."
        data={data.weekly}
        onChange={(d) => onUpdate({ ...data, weekly: d })}
      />
    </Card>
  );
}
