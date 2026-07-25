import { useAuth } from "@/context/AuthContext";

export function DashboardPage() {
  const {logout} = useAuth();

  return <h1 onClick={logout}>Dashboard</h1>;
}