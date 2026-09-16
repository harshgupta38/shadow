/**
 * Centralized "tuning knobs" — every magic number that controls timing,
 * animation, pagination, numeric limits, or placeholder/geometry sizing
 * across the app. Pure lookup tables (icon maps, dropdown option lists) and
 * domain enums stay local to their component — this file is only for values
 * a developer might want to tweak without hunting through component code.
 */

// ── Animation / motion timing ────────────────────────────────────────────────

export const ANIMATION = {
    /** Shared slide-out-then-unmount duration for closing side panels
     * (task/milestone/goal review panels, habit tracking panel, schedule detail panel). */
    PANEL_SLIDE_OUT_MS: 220,

    /** StepImageVisual crossfade — must stay in sync with its .scss transition duration. */
    STEP_VISUAL_TRANSITION_MS: 260,

    /** GoalWizardVisual crossfade (goal creation wizard's illustration). */
    GOAL_WIZARD_VISUAL_TRANSITION_MS: 420,

    /** "Understanding your answer…" fake-progress message cycle, shared by every
     * wizard's loading state (assistant, schedule, habit, goal task, goal milestone, goal creation). */
    WIZARD_LOADER_STEP_MS: 1100,

    /** GoalCreationWizard's walking-character: interval between steps when advancing multiple steps at once. */
    BOY_MULTI_STEP_INTERVAL_MS: 260,
    /** GoalCreationWizard's walking-character: fade duration when jumping backward multiple steps. */
    BOY_BACKWARD_FADE_MS: 200,

    /** ThemeContext — duration before removing the `theme-transitioning` class; must match the CSS transition. */
    THEME_TRANSITION_MS: 350,

    /** ToastContext — auto-dismiss duration for toasts. */
    TOAST_AUTO_DISMISS_MS: 4200,

    /** AssistantPage — how long the "Copied" checkmark feedback stays visible. */
    COPIED_FEEDBACK_MS: 1500,

    /** AssistantThinkingIndicator — how often the "Thinking…" phrase rotates. */
    THINKING_PHRASE_ROTATE_MS: 2600,
    /** AssistantThinkingIndicator — fade transition between phrase swaps. */
    THINKING_PHRASE_FADE_MS: 280,

    /** PlanPage — how long a completed item stays in "completing" animation state before removal. */
    PLAN_ITEM_COMPLETE_MS: 520,

    /** SimpleHabitCard — per-cell stagger delay in the weekly mini-heatmap. */
    STAGGER_HEATMAP_CELL_MS: 18,
    /** LandingPage — per-card stagger delay for the "reveal-up" step cards. */
    STAGGER_LANDING_CARD_MS: 120,
} as const;

/** Daily Brief page's typewriter-style progressive text reveal. */
export const TYPEWRITER = {
    CHARS_PER_TICK: 1,
    TICK_MS: 20,
    PARAGRAPH_PAUSE_MS: 1000,
} as const;

/** Press-and-hold +/- stepper buttons (metric habit progress, task progress). */
export const HOLD_REPEAT = {
    /** Delay before repeat-increment starts. */
    INITIAL_DELAY_MS: 260,
    /** Repeat rate while the button is held. */
    REPEAT_INTERVAL_MS: 90,
} as const;

// ── Debounce / polling / retry / timeouts ────────────────────────────────────

export const TIMING = {
    /** AIBehaviorCard — debounce before firing the provider/model health check after a change. */
    AI_HEALTH_CHECK_DEBOUNCE_MS: 600,
    /** AIBehaviorCard — how long the "ok" health-check tick stays visible before fading. */
    AI_HEALTH_TICK_VISIBLE_MS: 5000,
    /** AIBehaviorCard — fade-out duration for that tick. */
    AI_HEALTH_TICK_FADE_MS: 600,

    /** AuthContext — retry delay after a failed/aborted session-events SSE stream. */
    SSE_RETRY_DELAY_MS: 5000,

    /** NotificationsBell — max SSE reconnect attempts before giving up. */
    NOTIF_BELL_MAX_RETRIES: 8,
    /** NotificationsBell — exponential backoff base delay. */
    NOTIF_BELL_BACKOFF_BASE_MS: 1000,
    /** NotificationsBell — exponential backoff cap. */
    NOTIF_BELL_BACKOFF_CAP_MS: 30_000,

    /** Login/Register pages — countdown tick while rate-limit-locked out. */
    LOCKOUT_COUNTDOWN_TICK_MS: 1000,

    /** PlanPage — interval to re-check whether the calendar day has rolled over. */
    PLAN_DAY_ROLLOVER_CHECK_MS: 60_000,

    /** location.service — reuse a cached geolocation fix up to this many ms old. */
    LOCATION_CACHE_MAX_AGE_MS: 10 * 60 * 1000,
    /** location.service — max wait for a geolocation fix. */
    LOCATION_TIMEOUT_MS: 7000,

    /** api/client — default/fallback request timeout. */
    API_DEFAULT_TIMEOUT_MS: 30_000,
} as const;

// ── Pagination / batch sizes ──────────────────────────────────────────────────

export const PAGE_SIZE = {
    /** NotificationsPage — notifications fetched per "load more" batch. */
    NOTIFICATIONS_LIST: 30,
    /** NotificationsPage — IntersectionObserver threshold that triggers loading the next batch. */
    NOTIFICATIONS_LOAD_MORE_THRESHOLD: 0.1,
    /** api/notifications.ts — default fetch limit when the caller doesn't specify one. */
    NOTIFICATIONS_API_DEFAULT: 50,
    /** NotificationsBell — max items shown in the bell dropdown snapshot. */
    NOTIF_BELL_SNAPSHOT: 10,
    /** NotificationsBell — unread-count badge overflow cap (shows "9+" beyond this). */
    NOTIF_BELL_BADGE_CAP: 9,
    /** SchedulePage — max task chips shown per calendar day cell before overflow. */
    SCHEDULE_CELL_TASK_LIMIT: 2,
    /** ReportDetailPage — visible report-version pagination dots at once. */
    REPORT_VERSION_DOTS_WINDOW: 5,
} as const;

// ── Numeric limits (min/max/step bounds for inputs) ───────────────────────────

export const LIMITS = {
    MAX_CONCURRENT_DEVICES_MIN: 1,
    MAX_CONCURRENT_DEVICES_MAX: 6,

    /** Default auto-grow cap (in lines) for free-text textareas. */
    TEXTAREA_MAX_LINES: 8,
    /** Auto-grow cap for shorter list-item textareas (goal wizard review). */
    TEXTAREA_MAX_LIST_LINES: 4,
    /** Fallback line-height (px) used when CSS line-height can't be read. */
    TEXTAREA_FALLBACK_LINE_HEIGHT: 24,

    /** MyGoalsPage drag-and-drop — hold delay before a drag gesture activates. */
    DRAG_ACTIVATION_DELAY_MS: 200,
    /** MyGoalsPage drag-and-drop — move tolerance (px) before activation. */
    DRAG_ACTIVATION_TOLERANCE_PX: 5,
} as const;

// ── Skeleton / placeholder counts ─────────────────────────────────────────────

export const SKELETON = {
    DASHBOARD_GHOST_STATS: 4,
    DASHBOARD_GHOST_ITEM_WIDTHS: [72, 58, 65] as number[],
    HABIT_GHOST_MONTHS: 12,
    HABIT_GHOST_WEEKS: 5,
    HABIT_GHOST_HISTORY_ROW_WIDTHS: [62, 48, 75, 55] as number[],
} as const;

// ── SVG / ring geometry ────────────────────────────────────────────────────────

export const GEOMETRY = {
    PROGRESS_RING_SIZE: 104,
    PROGRESS_RING_STROKE: 10,
    CALENDAR_RING_RADIUS: 13,
    REPORT_MINI_RING_SIZE: 58,
    REPORT_MINI_RING_STROKE: 5,
    SPARKLINE_WIDTH: 200,
    SPARKLINE_HEIGHT: 50,
    SPARKLINE_PAD_Y: 4,
} as const;
