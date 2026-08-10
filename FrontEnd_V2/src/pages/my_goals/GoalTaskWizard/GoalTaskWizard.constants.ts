import type { TaskPlanningMethod, TaskStatus, TaskType } from "@/api";

export type TaskWizardStepKey = "defineTask" | "configureProgress" | "configurePlanning" | "additionalDetails";

export type TaskWizardAnswers = {
    title: string;
    note: string;
    taskType: TaskType;
    targetValue: string;
    valueUnit: string;
    planningEnabled: boolean;
    planningMethod: TaskPlanningMethod;
    plannerTarget: string;
    planningStartDate: string;
    startWithMilestone: boolean;
    planningEndDate: string;
    endWithMilestone: boolean;
};

export type TaskWizardStep = {
    key: TaskWizardStepKey;
    title: string;
    header: string | null;
    subtitle: string | null;
};

export const STEPS: TaskWizardStep[] = [
    {
        key: "defineTask",
        title: "Define Task",
        header: "What task will move this milestone forward?",
        subtitle: null,
    },
    {
        key: "configureProgress",
        title: "Configure Progress",
        header: "How will progress be measured?",
        subtitle: "Set the target and define how Shadow should track your progress.",
    },
    {
        key: "configurePlanning",
        title: "Configure Planning",
        header: "How should this task be planned?",
        subtitle: "Choose whether this task should appear in your daily plan and how much to plan.",
    },
    {
        key: "additionalDetails",
        title: "Additional Details",
        header: null,
        subtitle: null,
    },
];

export const EMPTY_ANSWERS: TaskWizardAnswers = {
    title: "",
    note: "",
    taskType: "Binary",
    targetValue: "",
    valueUnit: "",
    planningEnabled: false,
    planningMethod: "Daily",
    plannerTarget: "",
    planningStartDate: "",
    startWithMilestone: false,
    planningEndDate: "",
    endWithMilestone: false,
};

export const NUMERIC_TASK_STATUSES: TaskStatus[] = [
    "Not Started",
    "In Progress",
    "Paused",
    "Completed",
    "Cancelled",
];

export const BINARY_TASK_STATUSES: TaskStatus[] = ["Not Started", "Completed", "Cancelled"];

export const PLANNING_METHODS: TaskPlanningMethod[] = ["Daily", "Weekly", "Monthly"];

export const GOAL_LOADER_STEPS = [
    "Loading your goal details",
    "Loading milestone context",
    "Preparing task setup",
    "Almost there",
];

export const MAX_ANSWER_LINES = 8;
