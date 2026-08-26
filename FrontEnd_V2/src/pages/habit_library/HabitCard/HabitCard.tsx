import { Archive, ArrowCounterclockwise, CaretRightFill, PauseFill, PencilSquare, Plus, ThreeDotsVertical, Trash } from "react-bootstrap-icons";
import { Dropdown } from "react-bootstrap";
import { createPortal } from "react-dom";

import type { HabitDataResponse } from "@/api";
import {
  ChipTooltip,
  formatStatusLabel,
  getHabitDateLabel,
  getMetricFrequencyLabel,
  getSimpleFrequencyLabel,
  getPreferredTimeLabel,
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
  const frequencyLabel = h.planner_type === "metric"
    ? getMetricFrequencyLabel(h)
    : getSimpleFrequencyLabel(h);

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

          {createPortal(
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
          </Dropdown.Menu>, document.body)}
        </Dropdown>
      </div>

      <div className="hl-habit-card-foot">
        <div className="hl-habit-tags">
          <span className={`hl-habit-chip hl-habit-chip--status-${h.status}`}>
            <span className="hl-habit-chip-dot" aria-hidden="true" />
            {formatStatusLabel(h.status)}
          </span>
          <span className="hl-habit-chip hl-habit-chip--priority">
            {(priorityLabelMap.get(h.priority) ?? h.priority).split(":")[0]}
          </span>
          {h.planner_type === "metric" && h.planner_target != null && (
            frequencyLabel.tooltip ? (
              <ChipTooltip label="Days" items={frequencyLabel.tooltip}>
                <span className="hl-habit-chip hl-habit-chip--metric">
                  {h.planner_target}{h.value_unit ? ` ${h.value_unit}` : ""} {frequencyLabel.suffix}
                </span>
              </ChipTooltip>
            ) : (
              <span className="hl-habit-chip hl-habit-chip--metric">
                {h.planner_target}{h.value_unit ? ` ${h.value_unit}` : ""} {frequencyLabel.suffix}
              </span>
            )
          )}
          {h.planner_type === "simple" && (
            frequencyLabel.tooltip ? (
              <ChipTooltip label="Days" items={frequencyLabel.tooltip}>
                <span className="hl-habit-chip hl-habit-chip--metric">
                  {frequencyLabel.suffix}
                </span>
              </ChipTooltip>
            ) : (
              <span className="hl-habit-chip hl-habit-chip--metric">
                {frequencyLabel.suffix}
              </span>
            )
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
