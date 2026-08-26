import { ArrowRepeat, ChevronDown, Grid3x3Gap, List, PlusLg, Stars } from "react-bootstrap-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ROUTES } from "@/routes/RoutePaths";
import { api, ApiError } from "@/api";
import type { FilterState, HabitCreateRequest, HabitDataResponse } from "@/api";
import { FREQUENCY_OPTIONS, PRIORITY_OPTIONS } from "@/pages/habit_library/HabitWizard/HabitWizard.constants";
import { DEFAULT_FILTERS, EMPTY_FILTERS, FILTER_STATUS_OPTIONS } from "@/pages/habit_library/HabitLibraryPage.constants";
import { HabitCard } from "@/pages/habit_library/HabitCard/HabitCard";

import "@/pages/habit_library/HabitLibraryPage.scss";

export function HabitLibraryPage() {
  const navigate = useNavigate();

  const [habits, setHabits] = useState<HabitDataResponse[]>([]);
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [deleteTargetHabit, setDeleteTargetHabit] = useState<HabitDataResponse | null>(null);
  const [openHabitMenuId, setOpenHabitMenuId] = useState<number | null>(null);
  const [menuActionHabitId, setMenuActionHabitId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
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

  useEffect(() => {
    function enforceListView() {
      if (window.innerWidth < 1024) setViewMode("list");
    }

    enforceListView();
    window.addEventListener("resize", enforceListView);
    return () => window.removeEventListener("resize", enforceListView);
  }, []);

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

  function setStatusFilter(status: string) {
    if (status !== "total")
      setFilters((prev) => ({ ...prev, status: [status] }));
    else
      setFilters((prev) => ({ ...prev, status: [] }));
  }

  function handleStatusPillKeyDown(event: React.KeyboardEvent<HTMLSpanElement>, status: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setStatusFilter(status);
    }
  }

  const filteredHabits = useMemo(() => {
    return habits.filter((h) => {
      if (filters.status.length && !filters.status.some((s) => s === h.status))
        return false;
      if (filters.priority.length && !filters.priority.some((p) => p === h.priority))
        return false;
      if (
        filters.frequency.length &&
        !filters.frequency.some((f) => h.frequencies.includes(f))
      )
        return false;
      // if (filters.goalLinkage.includes("Not linked to goals") && h.linked_goal_ids.length > 0)
      //   return false;
      return true;
    });
  }, [habits, filters]);

  const priorityLabelMap = useMemo(() => new Map(PRIORITY_OPTIONS.map((option) => [option.value, option.label])), []);

  function openCreatePanel() {
    navigate(ROUTES.HABIT_LIBRARY_CREATE);
  }

  function openEditPanel(habit: HabitDataResponse) {
    setOpenHabitMenuId(null);
    navigate(ROUTES.HABIT_LIBRARY_EDIT.replace(":habitId", String(habit.id)), { state: { habit } });
  }

  function handleDuplicateHabit(habit: HabitDataResponse) {
    setOpenHabitMenuId(null);
    const draft: Partial<HabitCreateRequest> = {
      title: `${habit.title} (Copy)`,
      note: habit.note,
      frequencies: [...habit.frequencies],
      preferred_time: habit.preferred_time,
      specific_time: habit.specific_time,
      duration_minutes: habit.duration_minutes,
      start_date: habit.start_date,
      end_date: habit.end_date,
      priority: habit.priority,
      weekly_count: habit.weekly_count,
      monthly_count: habit.monthly_count,
      specific_days: habit.specific_days ? [...habit.specific_days] : null,
      day_fallback: habit.day_fallback,
      planner_type: habit.planner_type,
      planner_target: habit.planner_target,
      value_unit: habit.value_unit,
    };
    navigate(ROUTES.HABIT_LIBRARY_CREATE, { state: { draft } });
  }

  async function handleSetHabitStatus(habit: HabitDataResponse, status: "active" | "paused" | "archived") {
    setMenuActionHabitId(habit.id);
    setHabitsError(null);
    try {
      const updated = await api.habits.updateHabit(habit.id, { status });
      setHabits((prev) => prev.map((item) => (item.id === habit.id ? updated : item)));
      setOpenHabitMenuId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setHabitsError(err.message);
      } else {
        setHabitsError("Could not update this habit right now. Please try again.");
      }
    } finally {
      setMenuActionHabitId(null);
    }
  }

  async function handleDeleteHabit(habitId: number) {
    setMenuActionHabitId(habitId);
    setHabitsError(null);
    try {
      await api.habits.removeHabit(habitId);
      setHabits((prev) => prev.filter((item) => item.id !== habitId));
      setOpenHabitMenuId(null);
      setDeleteTargetHabit(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setHabitsError(err.message);
      } else {
        setHabitsError("Could not delete this habit right now. Please try again.");
      }
    } finally {
      setMenuActionHabitId(null);
    }
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
                <span
                  className="habit-stat-pill habit-stat-pill--active habit-stat-pill--clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatusFilter("active")}
                  onKeyDown={(event) => handleStatusPillKeyDown(event, "active")}
                >
                  {stats.active} Active
                </span>
                <span
                  className="habit-stat-pill habit-stat-pill--paused habit-stat-pill--clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatusFilter("paused")}
                  onKeyDown={(event) => handleStatusPillKeyDown(event, "paused")}
                >
                  {stats.paused} Paused
                </span>
                <span
                  className="habit-stat-pill habit-stat-pill--archived habit-stat-pill--clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatusFilter("archived")}
                  onKeyDown={(event) => handleStatusPillKeyDown(event, "archived")}
                >
                  {stats.archived} Archived
                </span>
                <span
                  className="habit-stat-pill habit-stat-pill--total habit-stat-pill--clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatusFilter("total")}
                  onKeyDown={(event) => handleStatusPillKeyDown(event, "total")}
                >
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

          <div className="hl-card-header-actions">
            {!loadingHabits && (<div className="hl-view-toggle" role="group" aria-label="Habit view">
              {viewMode === "list" && (<button
                type="button"
                className="hl-view-toggle-btn"
                aria-label="Switch to grid view"
                title="Switch to grid view"
                onClick={() => setViewMode("grid")}
              >
                <List size={15} />
              </button>)}
              {viewMode === "grid" && (<button
                type="button"
                className="hl-view-toggle-btn"
                aria-label="Switch to list view"
                title="Switch to list view"
                onClick={() => setViewMode("list")}
              >
                <Grid3x3Gap size={14} />
              </button>)}
            </div>)}

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
                  <FilterSection
                    label="Priority"
                    options={PRIORITY_OPTIONS.map((option) => ({ value: option.value, label: (priorityLabelMap.get(option.value) ?? option.value).split(":")[0] }))}
                    selected={filters.priority}
                    onToggle={(v) => toggleFilter("priority", v)}
                  />
                  {/* <FilterSection
                  label="Goal linkage"
                  options={GOAL_LINKAGE_OPTIONS}
                  selected={filters.goalLinkage}
                  onToggle={(v) => toggleFilter("goalLinkage", v)}
                /> */}
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
        </div>

        {/* ${viewMode === "grid" ? " less-padding-below" : ""} */}
        <div className={`hl-card-body`}>
          {loadingHabits ? (
            <HabitLibrarySkeleton />
          ) : habitsError ? (
            <div className="hl-empty-state">
              <p className="hl-empty-title">Failed to load habits</p>
              <p className="hl-empty-subtitle">{habitsError}</p>
              <button type="button" className="btn btn-soft btn-sm mt-2" onClick={() => void loadHabits()}>
                Try again
              </button>
            </div>
          ) : filteredHabits.length === 0 && habits.length === 0 ? (
            <div className="hl-empty-state">
              <div className="hl-empty-icon">
                <ArrowRepeat size={22} />
              </div>
              <p className="hl-empty-title">No habits yet</p>
              <p className="hl-empty-subtitle">
                Create your first habit to build daily consistency.
              </p>
            </div>
          ) : filteredHabits.length === 0 ? (
            <div className="hl-empty-state">
              <p className="hl-empty-title">No habits match your filters</p>
              <p className="hl-empty-subtitle">
                Try adjusting or clearing the active filters.
              </p>
              <button type="button" className="btn btn-soft btn-sm mt-2" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className={`hl-habit-grid${viewMode === "grid" ? " hl-habit-grid--grid" : ""}`}>
              {filteredHabits.map((h) => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  isMenuOpen={openHabitMenuId === h.id}
                  isBusy={menuActionHabitId === h.id}
                  onMenuToggle={(nextShow) => setOpenHabitMenuId(nextShow ? h.id : null)}
                  onEdit={() => openEditPanel(h)}
                  onDuplicate={() => handleDuplicateHabit(h)}
                  onTogglePause={() => void handleSetHabitStatus(h, h.status === "paused" ? "active" : "paused")}
                  onToggleArchive={() => void handleSetHabitStatus(h, h.status === "archived" ? "active" : "archived")}
                  onDeleteRequest={() => { setOpenHabitMenuId(null); setDeleteTargetHabit(h); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        show={deleteTargetHabit != null}
        title="Delete this habit?"
        message={`This will permanently remove "${deleteTargetHabit?.title ?? "this habit"}". This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        busy={deleteTargetHabit != null && menuActionHabitId === deleteTargetHabit.id}
        onConfirm={() => {
          if (deleteTargetHabit) {
            void handleDeleteHabit(deleteTargetHabit.id);
          }
        }}
        onCancel={() => setDeleteTargetHabit(null)}
      />
    </section>
  );
}

function HabitLibrarySkeleton() {
  return (
    <div className="hl-habit-skeleton-grid" aria-busy="true" aria-label="Loading habits">
      {Array.from({ length: 3 }, (_, index) => (
        <article className={`hl-habit-skeleton-card hl-habit-skeleton-card--${index % 3}`} key={index}>
          <div className="hl-habit-skeleton-head">
            <span className="hl-skeleton hl-habit-skeleton-title" />
            <span className="hl-skeleton hl-habit-skeleton-menu" />
          </div>
          <span className="hl-skeleton hl-habit-skeleton-description" />
          <span className="hl-skeleton hl-habit-skeleton-description hl-habit-skeleton-description--short" />
          <div className="hl-habit-skeleton-pills">
            <span className="hl-skeleton hl-habit-skeleton-pill hl-habit-skeleton-pill--status" />
            <span className="hl-skeleton hl-habit-skeleton-pill" />
            <span className="hl-skeleton hl-habit-skeleton-pill hl-habit-skeleton-pill--wide" />
          </div>
        </article>
      ))}
    </div>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="hl-filter-section">
      <p className="hl-filter-label">{label}</p>
      <div className="hl-filter-chips">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`hl-chip${selected.includes(opt.value) ? " hl-chip--active" : ""}`}
            onClick={() => onToggle(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

