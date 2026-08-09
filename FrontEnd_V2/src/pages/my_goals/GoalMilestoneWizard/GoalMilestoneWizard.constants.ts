export type MilestoneWizardStepKey = "title" | "description" | "reason" | "durationDays";

export type MilestoneWizardAnswers = Record<MilestoneWizardStepKey, string>;

export type MilestoneWizardStep = {
	key: MilestoneWizardStepKey;
	title: string;
	question: string;
	helper: string;
	placeholder: string;
};

export const STEPS: MilestoneWizardStep[] = [
	{
		key: "title",
		title: "Define Your Step",
		question: "What is this step about?",
		helper: "Give this step a clear title, then add a short description so it's easy to understand.",
		placeholder: "Example: Finish the first draft of the business plan.",
	},
	{
		key: "reason",
		title: "Explain The Why",
		question: "Tell us more about this step",
		helper: "Tell us why this step matters and how long you expect it to take.",
		placeholder: "Example: This helps me build the foundation before moving to the next step.",
	},
];

export const EMPTY_ANSWERS: MilestoneWizardAnswers = {
	title: "",
	description: "",
	reason: "",
	durationDays: "",
};

export const GOAL_LOADER_STEPS = [
    "Loading your goal details",
    "Gathering your milestones",
    "Checking your progress",
    "Preparing your goal overview",
    "Almost there",
];

export const MAX_ANSWER_LINES = 8;