import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

// Guards
import { PublicOnly, RequireAuth } from "@/routes/Guards";

// Route paths
import { ROUTES } from "@/routes/RoutePaths";

//layout
import { AppLayout } from "@/components/layout/AppLayout";

// Pages — lazy-loaded so each route ships in its own chunk instead of one monolithic
// bundle (e.g. the goal/task wizards' react-quill no longer loads for every visitor
// regardless of which page they're on).
const LandingPage = lazy(() => import("@/pages/landing_page/LandingPage").then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage").then(m => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const PlanPage = lazy(() => import("@/pages/plan/PlanPage").then(m => ({ default: m.PlanPage })));
const SchedulePage = lazy(() => import("@/pages/schedule/SchedulePage").then(m => ({ default: m.SchedulePage })));
const ScheduleWizardPage = lazy(() => import("@/pages/schedule/ScheduleWizard/ScheduleWizardPage").then(m => ({ default: m.ScheduleWizardPage })));
const MyGoalsPage = lazy(() => import("@/pages/my_goals/MyGoalsPage").then(m => ({ default: m.MyGoalsPage })));
const GoalDetailPage = lazy(() => import("@/pages/my_goals/GoalDetailPage/GoalDetailPage").then(m => ({ default: m.GoalDetailPage })));
const GoalMilestoneWizardPage = lazy(() => import("@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage").then(m => ({ default: m.GoalMilestoneWizardPage })));
const GoalTaskWizardPage = lazy(() => import("@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.tsx").then(m => ({ default: m.GoalTaskWizardPage })));
const TaskDetailPage = lazy(() => import("@/pages/my_goals/TaskDetailPage/TaskDetailPage").then(m => ({ default: m.TaskDetailPage })));
const HabitLibraryPage = lazy(() => import("@/pages/habit_library/HabitLibraryPage").then(m => ({ default: m.HabitLibraryPage })));
const HabitDetailPage = lazy(() => import("@/pages/habit_library/HabitDetailPage/HabitDetailPage").then(m => ({ default: m.HabitDetailPage })));
const HabitWizardPage = lazy(() => import("@/pages/habit_library/HabitWizard/HabitWizardPage").then(m => ({ default: m.HabitWizardPage })));
const TrackProgressPage = lazy(() => import("@/pages/track_progress/TrackProgressPage").then(m => ({ default: m.TrackProgressPage })));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage").then(m => ({ default: m.ReportsPage })));
const ReportDetailPage = lazy(() => import("@/pages/reports/ReportDetailPage/ReportDetailPage").then(m => ({ default: m.ReportDetailPage })));
const AssistantPage = lazy(() => import("@/pages/assistant/AssistantPage").then(m => ({ default: m.AssistantPage })));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage").then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() => import("@/pages/notifications/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));

function RouteFallback() {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
			<span className="spinner-border" role="status" aria-label="Loading" />
		</div>
	);
}

export function AppRoutes() {
	return (
		<Suspense fallback={<RouteFallback />}>
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
						<Route path={ROUTES.SCHEDULE_CREATE} element={<ScheduleWizardPage />} />
						<Route path={ROUTES.SCHEDULE_EDIT} element={<ScheduleWizardPage />} />

						<Route path={ROUTES.MY_GOALS} element={<MyGoalsPage />} />
						<Route path={ROUTES.MY_GOAL_DETAIL} element={<GoalDetailPage />} />
						<Route path={ROUTES.MY_GOAL_MILESTONE_CREATE} element={<GoalMilestoneWizardPage />} />
						<Route path={ROUTES.MY_GOAL_MILESTONE_UPDATE} element={<GoalMilestoneWizardPage />} />
						<Route path={ROUTES.MY_GOAL_MILESTONE_TASK_CREATE} element={<GoalTaskWizardPage />} />
						<Route path={ROUTES.MY_GOAL_MILESTONE_TASK_EDIT} element={<GoalTaskWizardPage />} />
						<Route path={ROUTES.TASK_DETAIL} element={<TaskDetailPage />} />

						<Route path={ROUTES.HABIT_LIBRARY} element={<HabitLibraryPage />} />
						<Route path={ROUTES.HABIT_LIBRARY_CREATE} element={<HabitWizardPage />} />
						<Route path={ROUTES.HABIT_LIBRARY_DETAIL} element={<HabitDetailPage />} />
						<Route path={ROUTES.HABIT_LIBRARY_EDIT} element={<HabitWizardPage />} />

						<Route path={ROUTES.TRACK_PROGRESS} element={<TrackProgressPage />} />
						<Route path={ROUTES.REPORTS} element={<ReportsPage />} />
						<Route path={ROUTES.REPORTS_DETAIL} element={<ReportDetailPage />} />
						<Route path={ROUTES.ASSISTANT} element={<AssistantPage />} />
						<Route path={ROUTES.NOTIFICATIONS} element={<NotificationsPage />} />
						<Route path={ROUTES.PROFILE} element={<ProfilePage />} />
						<Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
					</Route>
				</Route>

				<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</Suspense>
	);
}
