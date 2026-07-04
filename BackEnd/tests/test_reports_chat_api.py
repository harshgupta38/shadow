"""Reports & chat API tests (fake LLM provider)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app


class ModelCaptureProvider(LLMProvider):
    def __init__(self) -> None:
        self.models: list[str | None] = []

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.models.append(model)
        return "Captured response"


class TitleProvider(LLMProvider):
    def __init__(self) -> None:
        self.calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.calls += 1
        if max_tokens == 24:
            return "Morning Workout Plan"
        return "Assistant response"


class ActionProposalProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return (
                "{"
                '"actions":[{"module":"plan","type":"plan.create_task",'
                '"title":"Add deep work block",'
                '"rationale":"The user asked to schedule focused work.",'
                '"confidence":"high",'
                '"requires_confirmation":false,'
                '"destructive":false,'
                f'"args":{{"title":"Deep Work Session","date":"{date.today().isoformat()}"}}'
                "}]"
                "}"
            )
        return "Assistant response"


class CountingProvider(LLMProvider):
    def __init__(self) -> None:
        self.calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.calls += 1
        return "Model response"


class FreshIntakeContextProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'

        source = system or ""
        has_current_goal = "- Current goal: Crack Google" in source
        has_fresh_intake = "## Fresh intake mode" in source

        if has_fresh_intake and not has_current_goal:
            return "fresh-intake-context"
        if has_current_goal:
            return "current-goal-context"
        return "default-context"


class GoalDiscoverySynthesisProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "Harsh, what do you want to achieve, and by when?"

        return (
            "Let's break this down into trackable goals and actions:\n"
            "Goal 1: Define Target Google Roles (By 2026-08-01)\n"
            "- Why: Focus your preparation on specific role requirements.\n"
            "- Action 1.1: Explore Google Careers\n"
            "- Title: Browse Google SWE Roles\n"
            "- Description: Spend 2 hours browsing careers.google.com and shortlist 3-5 roles.\n"
            "- Category: Research\n"
            "- Target Date: 2026-07-15\n"
            "Goal 2: Assess Technical Skills (By 2026-08-15)\n"
            "- Why: Identify strengths and weaknesses in core technical areas.\n"
            "- Action 2.1: DSA Self-Assessment\n"
            "- Title: Complete LeetCode Basics\n"
            "- Description: Solve 5 easy and 3 medium LeetCode problems.\n"
            "- Category: Skill Assessment\n"
            "- Target Date: 2026-08-05"
        )


class GoalDiscoveryPlainFormatProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "Harsh, what's one key thing you'd like to achieve, and by when?"

        return (
            "That's a clear goal, Harsh.\n"
            "Let's set your main objective:\n"
            "Goal: Secure a job offer from Google. Target Date: 2026-12-31\n"
            "To get started, here's your first trackable goal:\n"
            "Goal: Understand Google's requirements and identify initial skill gaps. Target Date: 2026-07-31\n"
            "Here are your first three actions to achieve this:\n"
            "- Title: Research Google Roles\n"
            "  - Description: Explore Google Careers to identify 3-5 roles that align with your experience.\n"
            "  - Category: Career Research\n"
            "  - Target Date: 2026-07-18\n"
            "- Title: List Required Skills\n"
            "  - Description: Compile a master list of technical and behavioral skills Google looks for.\n"
            "  - Category: Skill Assessment\n"
            "  - Target Date: 2026-07-25\n"
            "- Title: Self-Assess Current Skills\n"
            "  - Description: Rate your proficiency and identify areas needing improvement.\n"
            "  - Category: Skill Assessment\n"
            "  - Target Date: 2026-08-01"
        )


class GoalDiscoveryJsonCategoryProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return (
                "{"
                '"actions":[{"module":"goals","type":"goals.create_goal",'
                '"title":"Save goal: Custom Coach Goal",'
                '"rationale":"Coach provided this category.",'
                '"confidence":"high",'
                '"requires_confirmation":false,'
                '"destructive":false,'
                '"args":{"title":"Custom Coach Goal","description":"From coach reply.",'
                '"category":"Research","target_date":"2026-12-31T00:00:00Z"}}]'
                "}"
            )
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "What is one thing you want to achieve, and by when?"
        return "Great, I will propose goal saves next."


class GoalDiscoveryMarkdownFormatProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "GOAL_DISCOVERY_EXTRACTION_JSON_V1" in prompt:
            return '{"goals":[]}'
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "Harsh, what's one key thing you'd like to achieve, and by when?"

        return (
            "That's a clear and ambitious goal, Harsh. Let's break it down into trackable steps.\n\n"
            "**Main Goal:** Secure SDE 1 Role at Google\n"
            "*   **Target Date:** 2026-12-31\n\n"
            "**Trackable Goal 1: Master Data Structures & Algorithms (DSA)**\n"
            "*   **Target Date:** 2026-09-15\n"
            "    *   **Action:** Complete LeetCode Grind 75\n"
            "        *   **Description:** Solve all problems in Grind 75 list.\n"
            "        *   **Category:** Technical Skills\n"
            "        *   **Target Date:** 2026-09-01\n"
            "    *   **Action:** Practice Advanced DSA Patterns\n"
            "        *   **Description:** Work through 50 medium-to-hard LeetCode problems.\n"
            "        *   **Category:** Technical Skills\n"
            "        *   **Target Date:** 2026-09-15\n\n"
            "**Trackable Goal 2: Build System Design Foundations**\n"
            "*   **Target Date:** 2026-10-15\n"
            "    *   **Action:** Study System Design Fundamentals\n"
            "        *   **Description:** Read DDIA chapters 1-5.\n"
            "        *   **Category:** Technical Skills\n"
            "        *   **Target Date:** 2026-10-01\n"
            "    *   **Action:** Solve Basic Design Problems\n"
            "        *   **Description:** Practice URL shortener and feed design.\n"
            "        *   **Category:** Technical Skills\n"
            "        *   **Target Date:** 2026-10-15\n\n"
            "**Trackable Goal 3: Prepare Application & Interview Strategy**\n"
            "*   **Target Date:** 2026-11-15\n"
            "    *   **Action:** Optimize Resume for Google\n"
            "        *   **Description:** Tailor resume using STAR format.\n"
            "        *   **Category:** Career Development\n"
            "        *   **Target Date:** 2026-10-30\n"
            "    *   **Action:** Complete Mock Interviews & Behavioral Prep\n"
            "        *   **Description:** Conduct 3 mock interviews.\n"
            "        *   **Category:** Interview Preparation\n"
            "        *   **Target Date:** 2026-11-15"
        )


class GoalDiscoveryFallbackStructureProvider(LLMProvider):
    def __init__(self) -> None:
        self.fallback_calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "GOAL_DISCOVERY_EXTRACTION_JSON_V1" in prompt:
            self.fallback_calls += 1
            return (
                "{"
                '"goals":[{'
                '"title":"Explore Google Careers",'
                '"description":"Review roles and shortlist 5 matches.",'
                '"category":"Research",'
                '"target_date":"2026-07-25"'
                "},{"
                '"title":"Run Interview Prep Sprint",'
                '"description":"Do mock interviews and behavioral prep.",'
                '"category":"Interview Preparation",'
                '"target_date":"2026-11-15"'
                "}]"
                "}"
            )
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "What is one thing you want to achieve, and by when?"

        return (
            "You should focus on role clarity first, then strengthen interviews over time. "
            "Let's iterate weekly and adjust based on outcomes."
        )


class MarkdownPlusJsonReplyProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Structured Sprint"

        return (
            "Absolutely. Here's a practical first sprint for your goal.\n"
            "- Clarify target companies and role expectations.\n"
            "- Start timed DSA practice with weekly reviews.\n\n"
            "```json\n"
            "{\n"
            '  "schema": "SHADOW_RESPONSE_JSON_V1",\n'
            '  "intent": "goal_setup",\n'
            '  "goals": [],\n'
            '  "actions": [{\n'
            '    "module": "goals",\n'
            '    "type": "goals.create_goal",\n'
            '    "title": "Save goal: Build Interview Fundamentals",\n'
            '    "rationale": "Structured payload from assistant reply.",\n'
            '    "confidence": "high",\n'
            '    "requires_confirmation": false,\n'
            '    "destructive": false,\n'
            '    "args": {\n'
            '      "title": "Build Interview Fundamentals",\n'
            '      "description": "Complete a four-week interview fundamentals sprint.",\n'
            '      "category": "Interview Preparation",\n'
            '      "target_date": "2026-10-01"\n'
            "    }\n"
            "  }]\n"
            "}\n"
            "```"
        )


class GoalDiscoveryStructuredReplyProvider(LLMProvider):
    def __init__(self) -> None:
        self.fallback_calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "GOAL_DISCOVERY_EXTRACTION_JSON_V1" in prompt:
            self.fallback_calls += 1
            return '{"goals":[]}'
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Discovery"

        last_user = ""
        for message in reversed(messages):
            if message.role == "user":
                last_user = message.content
                break

        if "[goal_discovery_seed]" in last_user:
            return "What role are you targeting and by when?"

        return (
            "Great direction. We'll focus on role clarity and interview execution.\n\n"
            "```json\n"
            "{\n"
            '  "schema": "SHADOW_RESPONSE_JSON_V1",\n'
            '  "intent": "goal_discovery_plan",\n'
            '  "goals": [\n'
            "    {\n"
            '      "title": "Map Google Role Requirements",\n'
            '      "description": "Review role descriptions and shortlist required competencies.",\n'
            '      "category": "Research",\n'
            '      "target_date": "2026-07-30"\n'
            "    },\n"
            "    {\n"
            '      "title": "Launch Mock Interview Cadence",\n'
            '      "description": "Run weekly mock interviews and track weak areas.",\n'
            '      "category": "Interview Preparation",\n'
            '      "target_date": "2026-11-15"\n'
            "    }\n"
            "  ],\n"
            '  "actions": []\n'
            "}\n"
            "```"
        )


class GoalCoachStructuredMilestoneJsonProvider(LLMProvider):
    def __init__(self) -> None:
        self.proposal_calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            self.proposal_calls += 1
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Goal Milestones"

        return (
            "Great choice. We will execute this in three phases.\n\n"
            "```json\n"
            "{\n"
            '  "schema": "SHADOW_RESPONSE_JSON_V1",\n'
            '  "intent": "goal_breakdown",\n'
            '  "goals": [],\n'
            '  "milestones": [\n'
            "    {\n"
            '      "title": "Complete DSA Foundation",\n'
            '      "description": "Solve 150 DSA problems and review patterns weekly.",\n'
            '      "due_date": "2026-08-31",\n'
            '      "order": 2\n'
            "    },\n"
            "    {\n"
            '      "title": "Run Mock Interview Cycle",\n'
            '      "description": "Finish 6 mock interviews with feedback loops.",\n'
            '      "due_date": "2026-10-15",\n'
            '      "order": 3\n'
            "    },\n"
            "    {\n"
            '      "title": "Prepare Resume Narrative",\n'
            '      "description": "Rewrite resume with quantified impact bullets.",\n'
            '      "due_date": "2026-07-31",\n'
            '      "order": 1\n'
            "    }\n"
            "  ],\n"
            '  "actions": []\n'
            "}\n"
            "```"
        )


class GoalFocusEchoProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        if system:
            for line in system.splitlines():
                if line.startswith("- Goal title: "):
                    goal_title = line.split(":", 1)[1].strip()
                    return f"Using goal: {goal_title}"
        return "No goal focus"


class GoalBreakdownProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Google Milestones"
        return (
            "1. Solidify DSA Foundations\n"
            "o Target: Complete 75% of your Coding Ninja DSA course and solve 250 LeetCode problems.\n"
            "o Why: Builds the essential problem-solving skills Google looks for.\n"
            "o Est. Completion: 6 months\n"
            "2. Master Advanced DSA & System Design Basics\n"
            "o Target: Solve 200 medium/hard DSA problems and finish a system design course.\n"
            "o Why: Crucial for tackling higher-complexity interview rounds.\n"
            "o Est. Completion: 6-8 months\n"
            "3. Build & Apply\n"
            "o Target: Build 2 projects and solve 10 system design case studies.\n"
            "o Why: Demonstrates practical application of your skills.\n"
            "o Est. Completion: 6-8 months\n"
            "4. Interview Ready\n"
            "o Target: Complete 5+ mock interviews and apply to Google.\n"
            "o Why: Converts preparation into offer-ready interview performance.\n"
            "o Est. Completion: 3-4 months"
        )


class BulletMilestoneBreakdownProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Weight Loss Milestones"
        return (
            "Here are milestones to help you lose 10KG by October end:\n"
            "• Milestone 1: By June 30th - Lose 2KG.\n"
            "• Milestone 2: By July 31st - Lose another 2KG (total 4KG).\n"
            "• Milestone 3: By August 31st - Lose another 2KG (total 6KG).\n"
            "• Milestone 4: By September 30th - Lose another 2KG (total 8KG).\n"
            "• Milestone 5: By October 31st - Achieve your 10KG weight loss goal.\n"
            "Next action: Weigh yourself and record your current weight to establish a baseline."
        )


class ProposalFailureFallbackProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            raise RuntimeError("proposal generation failed")
        if max_tokens == 24:
            return "SDE Milestones"
        return (
            "Here are three milestones to guide your progress toward getting an SDE 1 job at Google:\n"
            "1. DSA Mastery: Complete 300 LeetCode problems by August 31, 2024.\n"
            "2. System Design Fundamentals: Master core system design concepts by October 31, 2024.\n"
            "3. Frontend Deep Dive & Interview Readiness: Build 2 complex Angular projects by December 31, 2024.\n"
            "Let's focus on the first milestone."
        )


class LongTitleMilestoneProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Google Milestones"
        return (
            "Here are three milestones to guide your progress:\n"
            "1. Master DSA Fundamentals and complete essential modules of your Coding Ninja track while solving a very large batch of easy and medium LeetCode problems with daily review discipline.\n"
            "2. Build advanced problem-solving speed by practicing hard algorithm sets, writing post-mortems, and refining pattern recognition across arrays, trees, graphs, and dynamic programming.\n"
            "3. Complete full interview readiness with mocks, behavioral story preparation, and focused application execution."
        )


class TenMilestoneFallbackProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Google Milestones"
        return (
            "Here are 10 milestones:\n"
            "1. Strengthen DS fundamentals and complete baseline practice sets.\n"
            "2. Build medium-problem consistency with timed daily drills.\n"
            "3. Increase hard-problem exposure and error analysis depth.\n"
            "4. Study system design basics for interview-ready clarity.\n"
            "5. Practice frontend architecture and tradeoff communication.\n"
            "6. Build two portfolio projects with measurable outcomes.\n"
            "7. Refine resume, impact bullets, and role-targeted stories.\n"
            "8. Expand networking and referral conversations each week.\n"
            "9. Run mock interviews and apply structured feedback loops.\n"
            "10. Execute applications and final-round interview readiness."
        )


class MilestoneSubListProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Google Milestones"
        return (
            "Here are the milestones to guide you towards getting an SDE 1 job at Google, Harsh:\n"
            "1. DSA Foundation & Course Completion:\n"
            "◦ Complete 80% of your Coding Ninja course.\n"
            "◦ Solve 200 LeetCode problems (focus on Easy & Medium).\n"
            "◦ Target: Mid-2025\n"
            "2. Advanced DSA & Problem Solving Mastery:\n"
            "◦ Solve an additional 300 LeetCode problems (focus on Medium & Hard).\n"
            "◦ Consistently solve 10 LeetCode problems daily for 3 consecutive months.\n"
            "◦ Participate in at least 5 LeetCode contests.\n"
            "◦ Target: Early-2026\n"
            "3. System Design & Behavioral Readiness:\n"
            "◦ Complete a dedicated System Design course or comprehensive study.\n"
            "◦ Practice 10 common System Design problems.\n"
            "◦ Prepare and document answers for 20 common behavioral interview questions.\n"
            "◦ Target: Mid-2026\n"
            "4. Application & Interview Polish:\n"
            "◦ Refine your resume to highlight relevant skills and projects.\n"
            "◦ Complete 5 mock interviews (2 DSA, 2 System Design, 1 Behavioral).\n"
            "◦ Apply to Google.\n"
            "◦ Target: Late-2026"
        )


class ImplicitMilestoneBreakdownProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "META Roadmap"
        return (
            "Here's a breakdown for your 'get job at META' goal:\n"
            "Milestone 1: Master Core DSA & Problem Solving\n"
            "• Target: Consistently solve 10 LeetCode problems daily and complete DSA fundamentals.\n"
            "• Why: This builds the base needed for technical interviews.\n"
            "• Due Date: August 31, 2024\n"
            "Milestone 2: Deep Dive into System Design & Front-End Architecture\n"
            "• Target: Complete System Design prep and build a scalable front-end project.\n"
            "• Why: This proves architecture depth for SDE-1 interviews.\n"
            "• Due Date: December 31, 2024\n"
            "Milestone 3: Interview Readiness & Application\n"
            "• Target: Complete mocks and apply broadly.\n"
            "• Why: Converts preparation into interview outcomes.\n"
            "• Due Date: March 31, 2025"
        )


class PastDueDateMilestoneActionProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return (
                "{"
                '"actions":[{'
                '"module":"goals",'
                '"type":"goals.add_milestone",'
                '"title":"Add milestone: Reach 5 KG",'
                '"rationale":"Structured proposal from goal breakdown",'
                '"confidence":"high",'
                '"requires_confirmation":false,'
                '"destructive":false,'
                '"args":{'
                '"goal_id":999,'
                '"title":"Reach 5 KG",'
                '"due_date":"2024-08-05T00:00:00Z",'
                '"order":0'
                "}}]}"
            )
        if max_tokens == 24:
            return "Weight Milestones"
        return (
            "Here are milestones:\n"
            "1. Reach 5 KG\n"
            "o Estimated Completion: August 5, 2024\n"
            "o Why: Build momentum"
        )


def test_generate_daily_report(client: TestClient, auth_headers: dict) -> None:
    # Log some activity so the report has data.
    metrics = client.get("/api/metrics", headers=auth_headers).json()
    metric_id = metrics[0]["id"]
    client.post(
        f"/api/metrics/{metric_id}/logs",
        headers=auth_headers,
        json={"value": 120, "date": date.today().isoformat()},
    )

    response = client.post(
        "/api/reports/generate", headers=auth_headers, json={"period": "daily"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period"] == "daily"
    assert body["narrative"]
    assert body["next_steps"]
    assert "metrics" in body["metrics_json"]

    listing = client.get("/api/reports?period=daily", headers=auth_headers).json()
    assert len(listing) == 1


def test_chat_round_trip(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Hi"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/messages",
        headers=auth_headers,
        json={"content": "How should I plan my day?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user_message"]["role"] == "user"
    assert body["assistant_message"]["role"] == "assistant"
    assert body["assistant_message"]["content"]
    assert body["session"]["id"] == session["id"]
    assert isinstance(body["proposed_actions"], list)

    messages = client.get(
        f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
    ).json()
    assert len(messages) == 2


def test_goal_discovery_seed_turn_uses_fresh_intake_context(
    client: TestClient, auth_headers: dict
) -> None:
    provider = FreshIntakeContextProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        updated_profile = client.put(
            "/api/profile/basic",
            headers=auth_headers,
            json={"current_goal": "Crack Google"},
        )
        assert updated_profile.status_code == 200

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal discovery"},
        ).json()

        baseline = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Hello"},
        )
        assert baseline.status_code == 200
        assert baseline.json()["assistant_message"]["content"] == "current-goal-context"

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200
        assert kickoff.json()["assistant_message"]["content"] == "fresh-intake-context"

        follow_up = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to switch careers within 8 months."},
        )
        assert follow_up.status_code == 200
        assert follow_up.json()["assistant_message"]["content"] == "fresh-intake-context"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_plan_synthesizes_saveable_goal_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoverySynthesisProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200

        plan = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get into Google by end of 2026."},
        )
        assert plan.status_code == 200

        actions = plan.json()["proposed_actions"]
        goal_actions = [item for item in actions if item["type"] == "goals.create_goal"]
        assert len(goal_actions) >= 2

        by_title = {item["args"]["title"]: item["args"] for item in goal_actions}
        assert "Define Target Google Roles" in by_title
        assert "Assess Technical Skills" in by_title
        assert by_title["Define Target Google Roles"]["description"]
        assert by_title["Define Target Google Roles"]["category"]
        assert by_title["Define Target Google Roles"]["target_date"]
        assert by_title["Assess Technical Skills"]["description"]
        assert by_title["Assess Technical Skills"]["category"]
        assert by_title["Assess Technical Skills"]["target_date"]
        assert all(item["requires_confirmation"] is False for item in goal_actions)

        for action in goal_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        goals = client.get("/api/goals", headers=auth_headers)
        assert goals.status_code == 200
        goal_titles = {item["title"] for item in goals.json()}
        assert "Define Target Google Roles" in goal_titles
        assert "Assess Technical Skills" in goal_titles
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_plain_format_synthesizes_goal_executables(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryPlainFormatProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get job at Google by end of this year."},
        )
        assert response.status_code == 200

        goal_actions = [
            item
            for item in response.json()["proposed_actions"]
            if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) >= 5

        goal_titles = {item["args"]["title"] for item in goal_actions}
        assert "Secure a job offer from Google." in goal_titles
        assert "Understand Google's requirements and identify initial skill gaps." in goal_titles
        assert "Research Google Roles" in goal_titles
        assert "List Required Skills" in goal_titles
        assert "Self-Assess Current Skills" in goal_titles

        by_title = {item["args"]["title"]: item["args"] for item in goal_actions}
        assert by_title["Research Google Roles"]["category"] == "Career Research"
        assert by_title["Research Google Roles"]["target_date"] is not None
        assert by_title["List Required Skills"]["category"] == "Skill Assessment"
        assert by_title["List Required Skills"]["target_date"] is not None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_keeps_json_goal_category_verbatim(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryJsonCategoryProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get job at Google by end of 2026."},
        )
        assert response.status_code == 200

        goal_actions = [
            item
            for item in response.json()["proposed_actions"]
            if item["type"] == "goals.create_goal"
        ]
        assert any(item["args"]["category"] == "Research" for item in goal_actions)

        custom_goal_action = next(
            item for item in goal_actions if item["args"]["title"] == "Custom Coach Goal"
        )
        executed = client.post(
            f"/api/chat/sessions/{session['id']}/actions/execute",
            headers=auth_headers,
            json={"confirmed": False, "action": custom_goal_action},
        )
        assert executed.status_code == 200
        assert executed.json()["status"] == "executed"

        goals = client.get("/api/goals", headers=auth_headers)
        assert goals.status_code == 200
        saved = next(item for item in goals.json() if item["title"] == "Custom Coach Goal")
        assert saved["category"] == "Research"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_titled_session_still_synthesizes_without_seed_history(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryPlainFormatProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get job at Google by end of this year."},
        )
        assert response.status_code == 200

        goal_actions = [
            item
            for item in response.json()["proposed_actions"]
            if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) >= 2
        titles = {item["args"]["title"] for item in goal_actions}
        assert "Secure a job offer from Google." in titles
        assert "Understand Google's requirements and identify initial skill gaps." in titles
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_markdown_trackable_format_synthesizes_executables(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryMarkdownFormatProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get SDE 1 role at Google by end of 2026."},
        )
        assert response.status_code == 200

        goal_actions = [
            item
            for item in response.json()["proposed_actions"]
            if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) >= 8

        by_title = {item["args"]["title"]: item["args"] for item in goal_actions}
        assert "Secure SDE 1 Role at Google" in by_title
        assert any(title.startswith("Master Data Structures & Algorithms") for title in by_title)
        assert any(title.startswith("Build System Design Foundations") for title in by_title)
        assert any(title.startswith("Prepare Application & Interview Strategy") for title in by_title)
        assert "Complete LeetCode Grind 75" in by_title
        assert "Optimize Resume for Google" in by_title

        assert by_title["Complete LeetCode Grind 75"]["category"] == "Technical Skills"
        assert by_title["Optimize Resume for Google"]["category"] == "Career Development"
        assert by_title["Complete Mock Interviews & Behavioral Prep"]["category"] == (
            "Interview Preparation"
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_uses_ai_structure_fallback_when_parser_misses(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryFallbackStructureProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want to get SDE role at Google by end of 2026."},
        )
        assert response.status_code == 200
        assert provider.fallback_calls >= 1

        goal_actions = [
            item
            for item in response.json()["proposed_actions"]
            if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) == 2

        by_title = {item["args"]["title"]: item["args"] for item in goal_actions}
        assert by_title["Explore Google Careers"]["category"] == "Research"
        assert by_title["Run Interview Prep Sprint"]["category"] == "Interview Preparation"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_chat_reply_structured_json_is_hidden_and_used_for_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = MarkdownPlusJsonReplyProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Structured"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Help me with a focused prep sprint."},
        )
        assert response.status_code == 200

        body = response.json()
        assistant_text = body["assistant_message"]["content"]
        assert "SHADOW_RESPONSE_JSON_V1" not in assistant_text
        assert "```json" not in assistant_text
        assert "first sprint" in assistant_text

        goal_actions = [
            item for item in body["proposed_actions"] if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) == 1
        assert goal_actions[0]["args"]["title"] == "Build Interview Fundamentals"
        assert goal_actions[0]["args"]["category"] == "Interview Preparation"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_discovery_uses_inline_structured_json_before_model_fallback(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDiscoveryStructuredReplyProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Goal Discovery"},
        ).json()

        kickoff = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={
                "content": "[goal_discovery_seed] Ask me one clear question to understand what I want to achieve and by when.",
                "fresh_intake_mode": True,
            },
        )
        assert kickoff.status_code == 200
        fallback_calls_before_plan = provider.fallback_calls

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "I want an SDE role at Google by end of 2026."},
        )
        assert response.status_code == 200
        assert provider.fallback_calls == fallback_calls_before_plan

        body = response.json()
        assistant_text = body["assistant_message"]["content"]
        assert "SHADOW_RESPONSE_JSON_V1" not in assistant_text

        goal_actions = [
            item for item in body["proposed_actions"] if item["type"] == "goals.create_goal"
        ]
        assert len(goal_actions) == 2

        by_title = {item["args"]["title"]: item["args"] for item in goal_actions}
        assert by_title["Map Google Role Requirements"]["category"] == "Research"
        assert by_title["Launch Mock Interview Cadence"]["category"] == "Interview Preparation"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_session_can_persist_goal_id(client: TestClient, auth_headers: dict) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
    )
    assert session.status_code == 201
    body = session.json()
    assert body["goal_id"] == goal_id
    assert body["title"] == "Crack Google"


def test_non_goal_coach_session_rejects_goal_id(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "General", "goal_id": goal_id},
    )
    assert session.status_code == 400
    assert "goal_id" in session.json()["detail"]


def test_goal_coach_session_goal_id_enforces_ownership(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "Other"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    session = client.post(
        "/api/chat/sessions",
        headers=other_headers,
        json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
    )
    assert session.status_code == 404


def test_report_next_steps_respect_ai_suggestions_setting(
    client: TestClient, auth_headers: dict
) -> None:
    toggled = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_suggestions_enabled": False},
    )
    assert toggled.status_code == 200

    report = client.post(
        "/api/reports/generate",
        headers=auth_headers,
        json={"period": "daily"},
    )
    assert report.status_code == 200
    assert report.json()["next_steps"] == "Suggestions are disabled in AI behavior settings."


def test_chat_uses_normalized_model_override(client: TestClient, auth_headers: dict) -> None:
    provider = ModelCaptureProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        updated = client.put(
            "/api/settings/ai-behavior",
            headers=auth_headers,
            json={"ai_default_model": "Gemini 3.5"},
        )
        assert updated.status_code == 200
        assert updated.json()["ai_behavior"]["ai_default_model"] == "gemini-3.5"

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Model check"},
        ).json()
        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "hello"},
        )

        assert response.status_code == 200
        assert provider.models
        assert provider.models[-1] == "gemini-3.5"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_delete_chat_session_removes_session_and_messages(
    client: TestClient, auth_headers: dict
) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Disposable"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/messages",
        headers=auth_headers,
        json={"content": "hello"},
    )
    assert response.status_code == 200

    deleted = client.delete(f"/api/chat/sessions/{session['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    sessions = client.get("/api/chat/sessions", headers=auth_headers).json()
    assert all(item["id"] != session["id"] for item in sessions)

    messages = client.get(
        f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
    )
    assert messages.status_code == 404


def test_delete_chat_session_enforces_ownership(client: TestClient, auth_headers: dict) -> None:
    owned = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Private"},
    ).json()

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "Other"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    deleted = client.delete(f"/api/chat/sessions/{owned['id']}", headers=other_headers)
    assert deleted.status_code == 404


def test_delete_chat_session_does_not_delete_goals(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Keep this goal"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Delete me"},
    ).json()
    deleted = client.delete(f"/api/chat/sessions/{session['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    goals = client.get("/api/goals", headers=auth_headers)
    assert goals.status_code == 200
    assert any(item["id"] == goal_id for item in goals.json())


def test_chat_auto_generates_contextual_title(client: TestClient, auth_headers: dict) -> None:
    provider = TitleProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Shadow"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Plan a consistent morning workout routine"},
        )
        assert response.status_code == 200
        assert response.json()["session"]["title"] == "Morning Workout Plan"
        assert provider.calls == 3

        sessions = client.get("/api/chat/sessions", headers=auth_headers)
        assert sessions.status_code == 200
        assert sessions.json()[0]["title"] == "Morning Workout Plan"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_chat_keeps_custom_title(client: TestClient, auth_headers: dict) -> None:
    provider = TitleProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Career Notes"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Help me prep for interviews"},
        )
        assert response.status_code == 200
        assert response.json()["session"]["title"] == "Career Notes"
        assert provider.calls == 2
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_chat_returns_structured_proposed_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = ActionProposalProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "My planning chat"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Please schedule a deep work block for today."},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        assert len(actions) == 1
        assert actions[0]["type"] == "plan.create_task"
        assert actions[0]["module"] == "plan"
        assert actions[0]["requires_confirmation"] is False
        assert actions[0]["confidence"] == "high"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_execute_action_creates_plan_task(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-plan-1",
                "module": "plan",
                "type": "plan.create_task",
                "title": "Create stretch task",
                "rationale": "Useful next step",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "title": "Stretch for 15 minutes",
                    "date": date.today().isoformat(),
                },
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "executed"
    assert body["link"] == "/plan"

    tasks = client.get("/api/plan", headers=auth_headers)
    assert tasks.status_code == 200
    assert any(item["title"] == "Stretch for 15 minutes" for item in tasks.json())


def test_execute_action_requires_confirmation(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-plan-2",
                "module": "plan",
                "type": "plan.create_task",
                "title": "Create uncertain task",
                "rationale": "Could help",
                "confidence": "medium",
                "requires_confirmation": True,
                "destructive": False,
                "args": {
                    "title": "Read one chapter",
                    "date": date.today().isoformat(),
                },
            },
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    tasks = client.get("/api/plan", headers=auth_headers)
    assert tasks.status_code == 200
    assert all(item["title"] != "Read one chapter" for item in tasks.json())


def test_execute_action_supports_goals_and_track_modules(
    client: TestClient, auth_headers: dict
) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    goal_response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": True,
            "action": {
                "id": "act-goal-1",
                "module": "goals",
                "type": "goals.create_goal",
                "title": "Create interview goal",
                "rationale": "User asked for a new goal",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "title": "Prepare for backend interviews",
                    "description": "Focus on DSA and system design",
                    "category": "career",
                },
            },
        },
    )
    assert goal_response.status_code == 200
    goal_body = goal_response.json()
    assert goal_body["status"] == "executed"
    assert goal_body["entity_id"] is not None

    metrics = client.get("/api/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    deep_work = next(item for item in metrics.json() if item["key"] == "deep_work_minutes")

    log_response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-track-1",
                "module": "track",
                "type": "track.log_metric",
                "title": "Log deep work",
                "rationale": "User reported focused time",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "key": "deep_work_minutes",
                    "value": 45,
                    "date": date.today().isoformat(),
                    "note": "Focused coding session",
                },
            },
        },
    )
    assert log_response.status_code == 200
    assert log_response.json()["status"] == "executed"

    logs = client.get(f"/api/metrics/{deep_work['id']}/logs", headers=auth_headers)
    assert logs.status_code == 200
    assert any(entry["value"] == 45 for entry in logs.json())


def test_goal_coach_asks_which_goal_when_multiple_active_goals(
    client: TestClient, auth_headers: dict
) -> None:
    provider = CountingProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        content = response.json()["assistant_message"]["content"]
        assert "multiple goals" in content.lower()
        assert "Crack Google" in content
        assert "Lose 10kg weight" in content
        assert provider.calls == 0
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_prefers_session_goal_id_when_multiple_goals_exist(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Crack Google"
        assert response.json()["session"]["goal_id"] == google_id
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_attaches_session_goal_context_on_non_breakdown_messages(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "How am I doing this week?"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Crack Google"
        assert response.json()["session"]["goal_id"] == google_id
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_ignores_deleted_session_goal_and_uses_remaining_goal(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        weight_id = weight_goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        deleted = client.delete(f"/api/goals/{google_id}", headers=auth_headers)
        assert deleted.status_code == 204

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Lose 10kg weight"
        assert response.json()["session"]["goal_id"] == weight_id

        messages = client.get(
            f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
        )
        assert messages.status_code == 200
        assert messages.json()[0]["content"] == "Break my goals into milestones"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_returns_goal_linked_milestone_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalBreakdownProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 4
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(item["confidence"] == "high" for item in milestone_actions)
        assert all(item["requires_confirmation"] is False for item in milestone_actions)
        assert all(item["args"].get("details") is None for item in milestone_actions)
        action_by_title = {item["args"]["title"]: item for item in milestone_actions}
        assert "<ul>" in (action_by_title["Solidify DSA Foundations"]["args"]["description"] or "")
        assert "<li>" in (action_by_title["Solidify DSA Foundations"]["args"]["description"] or "")
        assert "Target:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]
        assert "Why:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]
        assert "Est. Completion:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}
        assert "Solidify DSA Foundations" in milestone_by_title
        assert "Master Advanced DSA & System Design Basics" in milestone_by_title
        assert "Build & Apply" in milestone_by_title
        assert "Interview Ready" in milestone_by_title
        assert milestone_by_title["Solidify DSA Foundations"].get("details") in (None, [])
        assert "<ul>" in (milestone_by_title["Solidify DSA Foundations"]["description"] or "")
        assert "Target:" in (milestone_by_title["Solidify DSA Foundations"]["description"] or "")
        assert "Why:" in (milestone_by_title["Solidify DSA Foundations"]["description"] or "")
        assert "Est. Completion:" in (
            milestone_by_title["Solidify DSA Foundations"]["description"] or ""
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_uses_structured_json_milestones(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalCoachStructuredMilestoneJsonProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200
        assert provider.proposal_calls == 0

        body = response.json()
        assistant_text = body["assistant_message"]["content"]
        assert "SHADOW_RESPONSE_JSON_V1" not in assistant_text
        assert "```json" not in assistant_text

        milestone_actions = [
            item for item in body["proposed_actions"] if item["type"] == "goals.add_milestone"
        ]
        assert len(milestone_actions) == 3
        assert [item["args"]["title"] for item in milestone_actions] == [
            "Prepare Resume Narrative",
            "Complete DSA Foundation",
            "Run Mock Interview Cycle",
        ]
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(item["args"]["due_date"] is not None for item in milestone_actions)
        assert all(item["args"].get("details") is None for item in milestone_actions)
        assert "<ul>" in (milestone_actions[0]["args"]["description"] or "")

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}
        assert "Prepare Resume Narrative" in milestone_by_title
        assert "Complete DSA Foundation" in milestone_by_title
        assert "Run Mock Interview Cycle" in milestone_by_title
        assert milestone_by_title["Prepare Resume Narrative"]["due_date"] is not None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_saves_bullet_milestone_format(
    client: TestClient, auth_headers: dict
) -> None:
    provider = BulletMilestoneBreakdownProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10KG weight by October end"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 5
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(
            "first step" not in ((item["args"].get("description") or "").lower())
            for item in milestone_actions
        )

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}
        titles = set(milestone_by_title)
        assert any("June 30" in title and "Lose 2KG" in title for title in titles)
        assert any("July 31" in title and "4KG" in title for title in titles)
        assert any("August 31" in title and "6KG" in title for title in titles)
        assert any("September 30" in title and "8KG" in title for title in titles)
        assert any("October 31" in title and "10KG" in title for title in titles)
        assert all(
            "first step" not in ((item["description"] or "").lower())
            for item in milestone_by_title.values()
        )
        assert all(item.get("details") in (None, []) for item in milestone_by_title.values())
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_still_saves_when_action_proposal_fails(
    client: TestClient, auth_headers: dict
) -> None:
    provider = ProposalFailureFallbackProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 3
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_titles = {item["title"] for item in milestones.json()}
        assert "DSA Mastery: Complete 300 LeetCode problems by August 31, 2024." in milestone_titles
        assert "System Design Fundamentals: Master core system design concepts by October 31, 2024." in milestone_titles
        assert (
            "Frontend Deep Dive & Interview Readiness: Build 2 complex Angular projects by December 31, 2024."
            in milestone_titles
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_handles_long_titles_without_dropping_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = LongTitleMilestoneProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 3
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(len(item["title"]) <= 120 for item in milestone_actions)

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        assert len(milestones.json()) == 3
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_saves_ten_fallback_milestones(
    client: TestClient, auth_headers: dict
) -> None:
    provider = TenMilestoneFallbackProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into 10 milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 10
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        assert len(milestones.json()) == 10
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_preserves_sublist_items_in_milestone_description(
    client: TestClient, auth_headers: dict
) -> None:
    provider = MilestoneSubListProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 4

        action_by_title = {item["args"]["title"]: item for item in milestone_actions}
        first_description = action_by_title["DSA Foundation & Course Completion"]["args"]["description"]
        assert first_description is not None
        assert action_by_title["DSA Foundation & Course Completion"]["args"].get("details") is None
        assert "<ul>" in first_description
        assert "<li>" in first_description
        assert "Complete 80% of your Coding Ninja course" in first_description
        assert "Solve 200 LeetCode problems" in first_description
        assert "Target:" in first_description
        assert "Mid-2025" in first_description

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}

        saved_description = milestone_by_title["DSA Foundation & Course Completion"]["description"] or ""
        assert milestone_by_title["DSA Foundation & Course Completion"].get("details") in (None, [])
        assert "<ul>" in saved_description
        assert "Complete 80% of your Coding Ninja course" in saved_description
        assert "Solve 200 LeetCode problems" in saved_description
        assert "Target:" in saved_description
        assert "Mid-2025" in saved_description
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_saves_milestones_when_reply_is_breakdown_without_explicit_user_keyword(
    client: TestClient, auth_headers: dict
) -> None:
    provider = ImplicitMilestoneBreakdownProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "get job at META"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        # No explicit milestone/breakdown keywords in the user text.
        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Can you create a practical roadmap for this?"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 3
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        saved_titles = {item["title"] for item in milestones.json()}
        assert "Master Core DSA & Problem Solving" in saved_titles
        assert "Deep Dive into System Design & Front-End Architecture" in saved_titles
        assert "Interview Readiness & Application" in saved_titles
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_drops_past_due_dates_from_milestone_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = PastDueDateMilestoneActionProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10KG weight"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones with dates"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 1
        assert milestone_actions[0]["args"]["due_date"] is None

        executed = client.post(
            f"/api/chat/sessions/{session['id']}/actions/execute",
            headers=auth_headers,
            json={"confirmed": False, "action": milestone_actions[0]},
        )
        assert executed.status_code == 200
        assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        assert len(milestones.json()) == 1
        assert milestones.json()[0]["due_date"] is None
    finally:
        app.dependency_overrides.pop(get_provider, None)
