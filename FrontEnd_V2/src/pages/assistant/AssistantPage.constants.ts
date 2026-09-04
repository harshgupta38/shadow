import { AssistantAgentType } from "@/api";
import type { ComponentType } from "react";
import {
  BarChartLineFill,
  BriefcaseFill,
  Bullseye,
  type IconProps,
  Robot,
} from "react-bootstrap-icons";

export interface AssistantAgent {
  type: AssistantAgentType;
  label: string;
  tagline: string;
  description: string;
  icon: ComponentType<IconProps>;
  gradient: [string, string];
  suggestions: string[];
}

export const ASSISTANT_AGENTS: Record<AssistantAgentType, AssistantAgent> = {
  shadow: {
    type: "shadow",
    label: "Shadow",
    tagline: "General assistant",
    description: "Your open-ended companion for anything on your mind.",
    icon: Robot,
    gradient: ["#7c6cff", "#4f8bff"],
    suggestions: [
      "Help me think through my week",
      "I'm feeling stuck on something",
      "What should I focus on right now?",
    ],
  },
  goal_coach: {
    type: "goal_coach",
    label: "Goal Coach",
    tagline: "Turns goals into plans",
    description: "Turns big goals into clear milestones and next actions.",
    icon: Bullseye,
    gradient: ["#16a97a", "#4f8bff"],
    suggestions: [
      "Help me break down a goal",
      "What should I work on next?",
      "My goal feels overwhelming — where do I start?",
    ],
  },
  career_advisor: {
    type: "career_advisor",
    label: "Career Advisor",
    tagline: "Guides your growth",
    description: "Helps you make smarter career decisions and build toward what's next.",
    icon: BriefcaseFill,
    gradient: ["#e0913a", "#e5484d"],
    suggestions: [
      "What should I focus on to grow my career?",
      "What skills should I build next?",
      "I'm unsure about my career direction",
    ],
  },
  insights: {
    type: "insights",
    label: "Insights",
    tagline: "Reads your numbers",
    description: "Spots patterns in your progress and suggests what to adjust.",
    icon: BarChartLineFill,
    gradient: ["#f0a94e", "#7c6cff"],
    suggestions: [
      "How am I trending this week?",
      "What's holding me back right now?",
      "Where should I focus next?",
    ],
  },
};

export const ASSISTANT_LOADER_STEPS = [
  "Loading your conversations…",
  "Gathering your chat history…",
  "Checking your recent sessions…",
  "Preparing your assistants…",
  "Almost there…",
];
