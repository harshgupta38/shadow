import { Archive, ArrowCounterclockwise, CaretRightFill, PauseFill, PencilSquare, Plus, ThreeDotsVertical, Trash } from "react-bootstrap-icons";
import { Dropdown } from "react-bootstrap";

import type { HabitDataResponse } from "@/api";
import {
  ChipTooltip,
  formatStatusLabel,
  frequencyLabelMap,
  getHabitDateLabel,
  getPrimaryFrequencyLabel,
  getPreferredTimeLabel,
  ordinal,
  priorityLabelMap,
} from "./HabitCard.constants";

import "./HabitCard.scss";

// ── Component ─────────────────────────────────────────────────────────────────

interface HabitCardProps {
  habit: HabitDataResponse;
  isMenuOpen: boolean;
  isBusy: boolean;
  onMenuToggle: (nextShow: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onTogglePause: () => void;
  onToggleArchive: () => void;
  onDeleteRequest: () => void;
}

export function HabitCard({
  habit: h,
  isMenuOpen,
  isBusy,
  onMenuToggle,
  onEdit,
  onDuplicate,
  onTogglePause,
  onToggleArchive,
  onDeleteRequest,
}: HabitCardProps) {
  return (
    <article className="hl-habit-card">
      <div className="hl-habit-card-head">
        <div>
          <h3 className="hl-habit-name">{h.title}</h3>
          {h.note && <div className="hl-habit-motivation">{h.note}</div>}
        </div>
        <Dropdown
          show={isMenuOpen}
          onToggle={onMenuToggle}
          align="end"
        >
          <Dropdown.Toggle
            as="button"
            type="button"
            className="btn btn-ghost btn-sm hl-habit-edit-btn"
            id={`habit-menu-${h.id}`}
            aria-label={`Open menu for ${h.title}`}
          >
            <ThreeDotsVertical size={14} />
          </Dropdown.Toggle>

          <Dropdown.Menu
            className="hl-habit-menu-popover"
            aria-label={`Actions for ${h.title}`}
            popperConfig={{ strategy: "fixed" }}
          >
            <Dropdown.Item className="hl-habit-menu-item" onClick={onEdit} disabled={isBusy}>
              <PencilSquare size={14} />
              Edit
            </Dropdown.Item>
            <Dropdown.Item className="hl-habit-menu-item" onClick={onDuplicate} disabled={isBusy}>
              <Plus size={14} />
              Duplicate
            </Dropdown.Item>
            <Dropdown.Item className="hl-habit-menu-item" onClick={onTogglePause} disabled={isBusy}>
              {h.status === "paused" ? <CaretRightFill size={14} /> : <PauseFill size={14} />}
              {h.status === "paused" ? "Resume" : "Pause"}
            </Dropdown.Item>
            <Dropdown.Item className="hl-habit-menu-item" onClick={onToggleArchive} disabled={isBusy}>
              {h.status === "archived" ? <ArrowCounterclockwise size={14} /> : <Archive size={14} />}
              {h.status === "archived" ? "Restore" : "Archive"}
            </Dropdown.Item>
            <Dropdown.Item
              className="hl-habit-menu-item hl-habit-menu-item--danger"
              onClick={onDeleteRequest}
              disabled={isBusy}
            >
              <Trash size={14} />
              Delete
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <div className="hl-habit-card-foot">
        <div className="hl-habit-tags">
          <span className={`hl-habit-chip hl-habit-chip--status-${h.status}`}>
            <span className="hl-habit-chip-dot" aria-hidden="true" />
            {formatStatusLabel(h.status)}
          </span>
          {h.planner_type === "metric" && h.planner_target != null && (
            <span className="hl-habit-chip hl-habit-chip--metric">
              {h.planner_target}{h.value_unit ? ` ${h.value_unit}` : ""} / day
            </span>
          )}
          <span className="hl-habit-chip hl-habit-chip--priority">
            {(priorityLabelMap.get(h.priority) ?? h.priority).split(":")[0]}
          </span>
          {h.frequencies.length > 1 ? (
            <ChipTooltip
              label="Frequency"
              items={h.frequencies.map((f) => frequencyLabelMap.get(f) ?? f)}
            >
              <span className="hl-habit-chip hl-habit-chip--detail">
                +{h.frequencies.length}
              </span>
            </ChipTooltip>
          ) : h.weekly_count != null && h.frequencies.includes("weekly") ? (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {h.weekly_count}×/week
            </span>
          ) : h.monthly_count != null && h.frequencies.includes("monthly") ? (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {h.monthly_count}×/month
            </span>
          ) : h.frequencies.length > 0 && h.frequencies[0] !== "specific_day" && (
            <span className="hl-habit-chip hl-habit-chip--frequency">
              {getPrimaryFrequencyLabel(h.frequencies)}
            </span>
          )}
          {h.specific_days != null && h.specific_days.length > 0 && h.frequencies.includes("specific_day") && (
            <ChipTooltip
              label="Days"
              items={h.specific_days.map((d) => ordinal(d))}
            >
              <span className="hl-habit-chip hl-habit-chip--detail">
                {h.specific_days.length <= 3
                  ? `Day${h.specific_days.length > 1 ? "s" : ""} ${h.specific_days.join(", ")}`
                  : `${h.specific_days.length} days/mo`}
              </span>
            </ChipTooltip>
          )}
          {getPreferredTimeLabel(h) && (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {getPreferredTimeLabel(h)}
            </span>
          )}
          {h.duration_minutes != null && h.duration_minutes > 0 && (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {h.duration_minutes} min
            </span>
          )}
          {getHabitDateLabel(h) && (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {getHabitDateLabel(h)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
