import { Route, Routes } from "react-router-dom";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";

export function AppRoutes() {
  return (
    <Routes>
        <Route path="/" element={<DashboardPage />} />
    </Routes>
  );
}