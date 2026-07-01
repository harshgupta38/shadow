import type { ComponentType } from "react";
import {
  BarChartLineFill,
  BriefcaseFill,
  Bullseye,
  type IconProps,
  Robot,
  Stars,
  SunriseFill,
} from "react-bootstrap-icons";

import type { AgentType } from "@/api";

export interface AgentMeta {
  type: AgentType;
  label: string;
  tagline: string;
  description: string;
  icon: ComponentType<IconProps>;
  /** Two-stop gradient for the agent avatar. */
  gradient: [string, string];
  /** Suggested opening prompts shown on an empty chat. */
  suggestions: string[];
}

export const AGENTS: Record<AgentType, AgentMeta> = {
  general: {
    type: "general",
    label: "Jarvis",
    tagline: "General assistant",
    description: "Your open-ended companion for anything on your mind.",
    icon: Robot,
    gradient: ["#7c6cff", "#4f8bff"],
    suggestions: [
      "Help me think through my week",
      "I'm feeling unmotivated today",
      "Summarise what you know about me",
    ],
  },
  goal_coach: {
    type: "goal_coach",
    label: "Goal Coach",
    tagline: "Turns goals into plans",
    description: "Breaks big goals into clear milestones and next actions.",
    icon: Bullseye,
    gradient: ["#16a97a", "#4f8bff"],
    suggestions: [
      "Break my goal into milestones",
      "What should I do this week toward my goal?",
      "Help me set a realistic target date",
    ],
  },
  career_advisor: {
    type: "career_advisor",
    label: "Career Advisor",
    tagline: "Guides your growth",
    description: "Career paths, skills to build, and growth guidance.",
    icon: BriefcaseFill,
    gradient: ["#e0913a", "#e5484d"],
    suggestions: [
      "What skills should I build next?",
      "How do I prepare for a promotion?",
      "Review my career direction",
    ],
  },
  daily_checkin: {
    type: "daily_checkin",
    label: "Daily Check-in",
    tagline: "Keeps you accountable",
    description: "A gentle daily nudge to keep you on track.",
    icon: SunriseFill,
    gradient: ["#f0a94e", "#7c6cff"],
    suggestions: [
      "Let's do my daily check-in",
      "Here's what I got done today",
      "I'm struggling to stay focused",
    ],
  },
  progress_analyst: {
    type: "progress_analyst",
    label: "Progress Analyst",
    tagline: "Reads your numbers",
    description: "Analyses your metrics and spots what to adjust.",
    icon: BarChartLineFill,
    gradient: ["#4f8bff", "#7c6cff"],
    suggestions: [
      "How am I trending this week?",
      "What's my biggest blocker right now?",
      "Where should I focus next?",
    ],
  },
  onboarding: {
    type: "onboarding",
    label: "Onboarding Interviewer",
    tagline: "Gets to know you",
    description: "Learns your goals and working style during onboarding.",
    icon: Stars,
    gradient: ["#7c6cff", "#e5484d"],
    suggestions: [],
  },
};

/** Agents a user can start a chat with (onboarding is internal). */
export const CHAT_AGENTS: AgentMeta[] = [
  AGENTS.general,
  AGENTS.goal_coach,
  AGENTS.career_advisor,
  AGENTS.daily_checkin,
  AGENTS.progress_analyst,
];

export function agentMeta(type: AgentType): AgentMeta {
  return AGENTS[type] ?? AGENTS.general;
}
