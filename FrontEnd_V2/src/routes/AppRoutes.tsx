import { Route, Routes } from "react-router-dom";

// Guards
import { RequireAuth } from "./Guards";

// Route paths
import { ROUTES } from "./RoutePaths";

// Pages
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
	return (
		<Routes>
			<Route path={ROUTES.LOGIN} element={<LoginPage />} />
			<Route path={ROUTES.REGISTER} element={<RegisterPage />} />

			<Route element={<RequireAuth />}>
				<Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
			</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}