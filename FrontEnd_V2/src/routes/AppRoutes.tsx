import { Route, Routes } from "react-router-dom";

// Guards
import { PublicOnly, RequireAuth } from "./Guards";

// Route paths
import { ROUTES } from "./RoutePaths";

// Pages
import { LandingPage } from "@/pages/landing_page/LandingPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
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
				<Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
			</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}