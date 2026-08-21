import { ArrowRepeat, ChevronDown, Stars } from "react-bootstrap-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";

import "@/pages/habit_library/HabitLibraryPage.scss";
import { HabitDataResponse, MOCK_HABITS, FilterState, EMPTY_FILTERS } from "./mock-data";

const STATUS_OPTIONS = ["Active", "Paused", "Archived"];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const GOAL_LINKAGE_OPTIONS = ["Not linked to goals", "No active goals"];
const FREQUENCY_OPTIONS = [
  "Daily", "Weekly", "Monthly", "Weekdays", "Weekends",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
  "First of month", "End of month",
];

export function HabitLibraryPage() {
  const navigate = useNavigate();

  const [habits] = useState<HabitDataResponse[]>(MOCK_HABITS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(
    () => ({
      total: habits.length,
      active: habits.filter((h) => h.status === "active").length,
      paused: habits.filter((h) => h.status === "paused").length,
      archived: habits.filter((h) => h.status === "archived").length,
    }),
    [habits],
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [filterOpen]);

  function openCoach() {
    navigate(ROUTES.ASSISTANT, {
      state: {
        agentType: "shadow",
        prefillMessage:
          "Review my active goals and milestones, then suggest specific habits I should build to make consistent progress toward accomplishing them.",
      },
    });
  }

  return (
    <section className="habit-library-page">
      <PageHeader
        title="Habit Library"
        subtitle="Create recurring commitments once, then keep them visible every day."
        icon={<ArrowRepeat size={20} />}
        actions={[]}
      />

      {/* ── Overview row ── */}
      <div className="d-flex gap-3 mb-4">
        <div className="flex-grow-1">
          <div className="surface habit-overview-card">
            <h2 className="habit-overview-title">Habit Library Overview</h2>
            <p className="habit-overview-subtitle">
              Tasks and recommendations are now powered by your Goal Coach.
            </p>
            <div className="d-flex align-items-center justify-content-between flex-wrap habit-overview-actions">
              <div className="habit-overview-pills">
                <span className="habit-stat-pill habit-stat-pill--active">
                  {stats.active} Active
                </span>
                <span className="habit-stat-pill habit-stat-pill--paused">
                  {stats.paused} Paused
                </span>
                <span className="habit-stat-pill habit-stat-pill--archived">
                  {stats.archived} Archived
                </span>
                <span className="habit-stat-pill habit-stat-pill--total">
                  {stats.total} Total
                </span>
              </div>
              <button type="button" className="btn btn-soft btn-sm habit-coach-btn" onClick={openCoach}>
                <Stars size={14} className="me-1" />
                Ask Coach
              </button>
            </div>
          </div>
        </div>
        <div className="col-lg-4 helper-section">
          <div className="surface habit-lifecycle-card">
            <h2 className="habit-overview-title">Not sure where to start?</h2>
            <p className="habit-overview-subtitle">
              Let your coach suggest habits aligned to your goals and current priorities.
            </p>
            <button type="button" className="btn btn-soft btn-sm habit-coach-btn" onClick={openCoach}>
              <Stars size={14} className="me-1" />
              Ask Coach
            </button>
          </div>
        </div>
      </div>

      {/* ── Habit library card with filters ── */}
      <div className="hl-card">
        <div className="hl-card-header">
          <div>
            <h2 className="hl-title">Habit library</h2>
            <p className="hl-subtitle">Your repetitive tasks and current lifecycle status.</p>
          </div>

          <div className="hl-filter-wrapper" ref={dropdownRef}>
            <button
              type="button"
              className={`hl-filter-btn${filterOpen ? " hl-filter-btn--open" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              Filters
              <ChevronDown size={12} className={`hl-chevron${filterOpen ? " hl-chevron--up" : ""}`} />
            </button>

            {filterOpen && (
              <div className="hl-filter-dropdown">
                <FilterSection
                  label="Status"
                  options={STATUS_OPTIONS}
                  selected={filters.status}
                  onToggle={(v) => toggleFilter("status", v)}
                />
                <FilterSection
                  label="Priority"
                  options={PRIORITY_OPTIONS}
                  selected={filters.priority}
                  onToggle={(v) => toggleFilter("priority", v)}
                />
                <FilterSection
                  label="Goal linkage"
                  options={GOAL_LINKAGE_OPTIONS}
                  selected={filters.goalLinkage}
                  onToggle={(v) => toggleFilter("goalLinkage", v)}
                />
                <FilterSection
                  label="Frequency"
                  options={FREQUENCY_OPTIONS}
                  selected={filters.frequency}
                  onToggle={(v) => toggleFilter("frequency", v)}
                />
                <div className="hl-filter-reset">
                  <button
                    type="button"
                    className="hl-reset-btn"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    Reset filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
    </section>
  );
}
