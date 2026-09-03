import { Archive, ArrowCounterclockwise, CaretRightFill, Link45deg, PauseFill, PencilSquare, Plus, TagFill, ThreeDotsVertical, Trash } from "react-bootstrap-icons";
import { Dropdown } from "react-bootstrap";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes/RoutePaths";

import type { HabitDataResponse } from "@/api";
import { PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";
import {
  ChipTooltip,
  formatStatusLabel,
  getHabitDateLabel,
  getMetricFrequencyLabel,
  getSimpleFrequencyLabel,
  getPreferredTimeLabel,
  PriorityIcon,
} from "./HabitCard.constants";

import "./HabitCard.scss";

// ── Component ─────────────────────────────────────────────────────────────────

interface HabitCardProps {
  habit: HabitDataResponse;
  isMenuOpen: boolean;
  isBusy: boolean;
  viewMode: "grid" | "list";
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
  viewMode,
  onMenuToggle,
  onEdit,
  onDuplicate,
  onTogglePause,
  onToggleArchive,
  onDeleteRequest,
}: HabitCardProps) {
  const navigate = useNavigate();
  const frequencyLabel = h.planner_type === "metric"
    ? getMetricFrequencyLabel(h)
    : getSimpleFrequencyLabel(h);
  const timeLabel = getPreferredTimeLabel(h);
  const dateLabel = getHabitDateLabel(h);

  function goToDetail(e: React.MouseEvent | React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest(".hl-habit-edit-btn, .hl-habit-chip--goal, .hl-habit-menu-popover")) return;
    navigate(ROUTES.HABIT_LIBRARY_DETAIL.replace(":habitId", String(h.id)));
  }

  return (
    <article
      className="hl-habit-card"
      onClick={goToDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goToDetail(e); }}
    >
      <div className="hl-habit-card-head">
        <div className="hl-habit-card-head-content">
          <div className="hl-habit-title-row">
            {h.current_streak > 0 && (
              <span className="hl-habit-streak-pill" role="img" aria-label={`${h.current_streak} day streak`}>
                🔥 {h.current_streak}
              </span>
            )}
            <h3 className={`hl-habit-name${viewMode === "grid" ? " hl-habit-name--grid" : ""}`}>{h.title}</h3>
          </div>
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
          <span className={`hl-habit-chip hl-habit-chip--priority-${h.priority}`}>
            <PriorityIcon priority={h.priority} />
            {PRIORITY_LABEL[h.priority]}
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
          {timeLabel && (
            <span className="hl-habit-chip hl-habit-chip--detail">{timeLabel}</span>
          )}
          {h.duration_minutes != null && h.duration_minutes > 0 && (
            <span className="hl-habit-chip hl-habit-chip--detail">
              {h.duration_minutes} min
            </span>
          )}
          {dateLabel && (
            <span className="hl-habit-chip hl-habit-chip--detail">{dateLabel}</span>
          )}
          {h.category && (
            <span className="hl-habit-chip hl-habit-chip--category">
              <TagFill size={10} />
              {h.category}
            </span>
          )}
          {h.goal && (
            <button
              type="button"
              className="hl-habit-chip hl-habit-chip--goal hl-habit-chip--clickable"
              title={h.goal.title}
              onClick={() => navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(h.goal!.id)))}
            >
              <Link45deg size={11} />
              {h.goal.title.length > 15 ? `${h.goal.title.slice(0, 15)}…` : h.goal.title}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
