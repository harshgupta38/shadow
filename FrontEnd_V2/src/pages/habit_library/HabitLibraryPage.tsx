import { ArrowRepeat, ChevronDown, PlusLg, Stars } from "react-bootstrap-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";
import { HabitFormPanel } from "@/pages/habit_library/HabitFormPanel/HabitFormPanel";
import { api, ApiError } from "@/api";
import type { FilterState, HabitDataResponse } from "@/api";
import { EMPTY_FILTERS, FILTER_STATUS_OPTIONS, FILTER_FREQUENCY_OPTIONS } from "@/pages/habit_library/HabitFormPanel/HabitFormPanel.constants";

import "@/pages/habit_library/HabitLibraryPage.scss";

export function HabitLibraryPage() {
  const navigate = useNavigate();

  const [habits, setHabits] = useState<HabitDataResponse[]>([]);
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showHabitPanel, setShowHabitPanel] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitDataResponse | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadHabits = useCallback(async () => {
    setLoadingHabits(true);
    setHabitsError(null);
    try {
      const response = await api.habits.getList();
      setHabits(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setHabitsError(err.message);
      } else {
        setHabitsError("Could not load habits right now. Please try again.");
      }
      setHabits([]);
    } finally {
      setLoadingHabits(false);
    }
  }, []);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

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

  function toggleFilter(category: keyof FilterState, value: string) {
    setFilters((prev) => {
      const list = prev[category];
      return {
        ...prev,
        [category]: list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value],
      };
    });
  }

  const filteredHabits = useMemo(() => {
    return habits.filter((h) => {
      if (filters.status.length && !filters.status.some((s) => s.toLowerCase() === h.status))
        return false;
      // if (filters.priority.length && !filters.priority.some((p) => p.toLowerCase() === h.priority))
      //   return false;
      if (
        filters.frequency.length &&
        !filters.frequency.some((f) => h.frequencies.includes(f.toLowerCase()))
      )
        return false;
      // if (filters.goalLinkage.includes("Not linked to goals") && h.linked_goal_ids.length > 0)
      //   return false;
      return true;
    });
  }, [habits, filters]);

  function openCreatePanel() {
    setEditingHabit(null);
    setShowHabitPanel(true);
  }

  function openEditPanel(habit: HabitDataResponse) {
    setEditingHabit(habit);
    setShowHabitPanel(true);
  }

  function closePanel() {
    setShowHabitPanel(false);
    setEditingHabit(null);
  }

  function handleHabitSaved(saved: HabitDataResponse) {
    setHabits((prev) => {
      const exists = prev.some((h) => h.id === saved.id);
      return exists ? prev.map((h) => (h.id === saved.id ? saved : h)) : [saved, ...prev];
    });
  }

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
        actions={[
          {
            key: "add-habit",
            label: "Add habit",
            icon: <PlusLg size={14} />,
            tone: "brand",
            onClick: openCreatePanel,
          },
        ]}
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
                  options={FILTER_STATUS_OPTIONS}
                  selected={filters.status}
                  onToggle={(v) => toggleFilter("status", v)}
                />
                {/* <FilterSection
                  label="Priority"
                  options={PRIORITY_OPTIONS}
                  selected={filters.priority}
                  onToggle={(v) => toggleFilter("priority", v)}
                /> */}
                {/* <FilterSection
                  label="Goal linkage"
                  options={GOAL_LINKAGE_OPTIONS}
                  selected={filters.goalLinkage}
                  onToggle={(v) => toggleFilter("goalLinkage", v)}
                /> */}
                <FilterSection
                  label="Frequency"
                  options={FILTER_FREQUENCY_OPTIONS}
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

        <div className="hl-card-body">
          {loadingHabits ? (
            // TODO add a loading placeholder
            <div className="hl-empty-state">
              <p className="hl-empty-subtitle">Loading habits…</p>
            </div>
          ) : habitsError ? (
            <div className="hl-empty-state">
              <p className="hl-empty-title">Failed to load habits</p>
              <p className="hl-empty-subtitle">{habitsError}</p>
              <button type="button" className="btn btn-soft btn-sm mt-2" onClick={() => void loadHabits()}>
                Try again
              </button>
            </div>
          ) : filteredHabits.length === 0 ? (
            <div className="hl-empty-state">
              <div className="hl-empty-icon">
                <ArrowRepeat size={22} />
              </div>
              <p className="hl-empty-title">No repetitive tasks yet</p>
              <p className="hl-empty-subtitle">
                Create your first recurring commitment to build daily consistency.
              </p>
            </div>
          ) : (
            // TODO redesign this
            <div className="hl-habit-list">
              {filteredHabits.map((h) => (
                <div key={h.id} className="hl-habit-row">
                  <span className="hl-habit-name">{h.name}</span>
                  <span className={`hl-habit-status hl-habit-status--${h.status}`}>{h.status}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm hl-habit-edit-btn"
                    aria-label={`Edit ${h.name}`}
                    onClick={() => openEditPanel(h)}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showHabitPanel && (
        <HabitFormPanel
          mode={editingHabit ? "edit" : "create"}
          initialDraft={editingHabit ? {
            name: editingHabit.name,
            motivation: editingHabit.motivation,
            frequencies: [...editingHabit.frequencies],
            preferred_time: editingHabit.preferred_time ?? "flexible",
            duration_minutes: editingHabit.duration_minutes,
            start_date: editingHabit.start_date,
            end_date: editingHabit.end_date,
            is_ongoing: editingHabit.end_date == null,
          } : undefined}
          editingId={editingHabit?.id}
          onClose={closePanel}
          onSaved={handleHabitSaved}
        />
      )}
    </section>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="hl-filter-section">
      <p className="hl-filter-label">{label}</p>
      <div className="hl-filter-chips">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`hl-chip${selected.includes(opt) ? " hl-chip--active" : ""}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
