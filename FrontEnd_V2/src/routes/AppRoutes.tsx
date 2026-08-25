import { Route, Routes } from "react-router-dom";

// Guards
import { PublicOnly, RequireAuth } from "@/routes/Guards";

// Route paths
import { ROUTES } from "@/routes/RoutePaths";

//layout
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import { LandingPage } from "@/pages/landing_page/LandingPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { PlanPage } from "@/pages/plan/PlanPage";
import { SchedulePage } from "@/pages/schedule/SchedulePage";
import { MyGoalsPage } from "@/pages/my_goals/MyGoalsPage";
import { GoalDetailPage } from "@/pages/my_goals/GoalDetailPage/GoalDetailPage";
import { GoalMilestoneWizardPage } from "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage";
import { GoalTaskWizardPage } from "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.tsx";
import { HabitLibraryPage } from "@/pages/habit_library/HabitLibraryPage";
import { TrackProgressPage } from "@/pages/track_progress/TrackProgressPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { AssistantPage } from "@/pages/assistant/AssistantPage";
import { ProfilePage } from "@/pages/profile/ProfilePage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
	return (
		<Routes>
			<Route element={<PublicOnly />}>
				<Route path={ROUTES.LANDING} element={<LandingPage />} />
				<Route path={ROUTES.LOGIN} element={<LoginPage />} />
				<Route path={ROUTES.REGISTER} element={<RegisterPage />} />
			</Route>

			<Route element={<RequireAuth />}>
				<Route element={<AppLayout />}>
					<Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
					<Route path={ROUTES.PLAN} element={<PlanPage />} />
					<Route path={ROUTES.SCHEDULE} element={<SchedulePage />} />

					<Route path={ROUTES.MY_GOALS} element={<MyGoalsPage />} />
					<Route path={ROUTES.MY_GOAL_DETAIL} element={<GoalDetailPage />} />
					<Route path={ROUTES.MY_GOAL_MILESTONE_CREATE} element={<GoalMilestoneWizardPage />} />
					<Route path={ROUTES.MY_GOAL_MILESTONE_UPDATE} element={<GoalMilestoneWizardPage />} />
					<Route path={ROUTES.MY_GOAL_MILESTONE_TASK_CREATE} element={<GoalTaskWizardPage />} />
					<Route path={ROUTES.MY_GOAL_MILESTONE_TASK_EDIT} element={<GoalTaskWizardPage />} />
					
					<Route path={ROUTES.HABIT_LIBRARY} element={<HabitLibraryPage />} />
					<Route path={ROUTES.TRACK_PROGRESS} element={<TrackProgressPage />} />
					<Route path={ROUTES.REPORTS} element={<ReportsPage />} />
					<Route path={ROUTES.ASSISTANT} element={<AssistantPage />} />
					<Route path={ROUTES.PROFILE} element={<ProfilePage />} />
					<Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
				</Route>
			</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}