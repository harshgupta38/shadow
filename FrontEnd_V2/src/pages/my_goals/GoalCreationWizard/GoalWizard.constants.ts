export type GoalWizardStepKey = "goal" | "why" | "success" | "reality" | "obstacles";

export type GoalWizardStep = {
    key: GoalWizardStepKey;
    title: string;
    question: string;
    helper: string;
    placeholder: string;
};

export const STEPS: GoalWizardStep[] = [
    {
        key: "goal",
        title: "Define Your Goal",
        question: "What do you want to achieve?",
        helper: "Capture the outcome in your own words. Keep it broad for now.",
        placeholder: "Example: Build a consistent morning routine that gives me more energy and focus.",
    },
    {
        key: "why",
        title: "Understand Your Why",
        question: "Why is this important to you?",
        helper: "This helps us understand the motivation behind the goal.",
        placeholder: "Example: I want to feel calmer, more productive, and proud of how I start my day.",
    },
    {
        key: "success",
        title: "Describe Success",
        question: "How will you know you achieved it?",
        helper: "Define a clear success signal so the goal can be measured.",
        placeholder: "Example: I complete the routine at least 5 days a week for the next 30 days.",
    },
    {
        key: "reality",
        title: "Your Current Situation",
        question: "What is your current situation?",
        helper: "Describe where you are today before we plan the path forward.",
        placeholder: "Example: I often wake up late, rush through the morning, and lose focus before work.",
    },
    {
        key: "obstacles",
        title: "Identify Challenges",
        question: "What is the biggest challenge stopping you?",
        helper: "Name the main friction so the backend can shape a practical plan.",
        placeholder: "Example: I stay up too late and I do not have a fixed routine yet.",
    },
];

export const LOADER_STEPS = [
    "Reading your goal context",
    "Finding the deeper motivation",
    "Checking what success should look like",
    "Reviewing your current reality",
    "Mapping the biggest blockers",
    "Preparing a structured goal brief",
];

export const EMPTY_ANSWERS: Record<GoalWizardStepKey, string> = {
    goal: "",
    why: "",
    success: "",
    reality: "",
    obstacles: "",
};