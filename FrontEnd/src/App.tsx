import { Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import {
  PublicOnly,
  RequireAuth,
  RequireOnboarded,
  RequireVerifiedEmail,
} from "@/components/routing/Guards";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";
import { ChatPage } from "@/pages/chat/ChatPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { AutomationPage } from "@/pages/automation/AutomationPage";
import { GoalDetailPage } from "@/pages/goals/GoalDetailPage";
import { GoalsPage } from "@/pages/goals/GoalsPage";
import { JournalPage } from "@/pages/journal/JournalPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/notifications/NotificationsPage";
import { OnboardingPage } from "@/pages/onboarding/OnboardingPage";
import { PlanPage } from "@/pages/plan/PlanPage";
import { MemoryCenterPage } from "@/pages/profile/MemoryCenterPage";
import { ProfilePage } from "@/pages/profile/ProfilePage";
import { RepetitiveTasksPage } from "@/pages/repetitiveTasks/RepetitiveTasksPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { ReportViewerPage } from "@/pages/reports/ReportViewerPage";
import { SchedulePage } from "@/pages/schedule/SchedulePage";
import { EmailNotificationControlsPage } from "@/pages/settings/EmailNotificationControlsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { TrackPage } from "@/pages/track/TrackPage";

export default function App() {
  return (
    <Routes>
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Public */}
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Authenticated, pre-onboarding */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      {/* Authenticated + onboarded app */}
      <Route element={<RequireOnboarded />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:goalId" element={<GoalDetailPage />} />
          <Route path="/repetitive-tasks" element={<RepetitiveTasksPage />} />
          <Route path="/track" element={<TrackPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/day/:historyDate" element={<ReportViewerPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/assistant" element={<ChatPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/memory-center" element={<MemoryCenterPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/settings/email-controls"
            element={
              <RequireVerifiedEmail>
                <EmailNotificationControlsPage />
              </RequireVerifiedEmail>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
