from datetime import date

from app.schemas.goals import UnderstandGoalRequest


GOAL_REFINEMENT_SYSTEM_INSTRUCTION = (
	"You are an expert goal coach.\n"
	"Analyze the user's responses to build a complete goal profile.\n"
	"Base your conclusions on the user's answers.\n"
	"When required information is missing, infer the most reasonable value from the available context.\n"
	"Do not contradict the user's responses.\n"
	"Be realistic and concise.\n"
	"Return only a JSON object matching the required schema."
)


def build_goal_refinement_user_prompt(request_data: UnderstandGoalRequest) -> str:
	return (
		f"Current Date: {date.today().isoformat()}\n\n"
		"User Responses\n\n"
		f"Goal: {request_data.goal.strip()}\n"
		f"Why: {request_data.why.strip()}\n"
		f"Success: {request_data.success.strip()}\n"
		f"Current Situation: {request_data.reality.strip()}\n"
		f"Obstacles: {request_data.obstacles.strip()}\n\n"
		"Additional Instructions:\n"
		"- If the user does not specify a target date, estimate a realistic future date.\n"
		"- Success metrics should be specific and measurable.\n"
		"- Infer strengths from the user's current situation and responses.\n"
		"- Infer coaching insights that are directly supported by the user's responses."
	)