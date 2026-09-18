import { useAuth } from "@/context/AuthContext";

export function DashboardPlaceholder() {
  const { user, logout } = useAuth();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--jv-font-sans)",
        background: "var(--jv-bg)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "var(--jv-muted)", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
          Signed in as <strong>{user?.username}</strong>
        </p>
        <h2 style={{ fontFamily: "var(--jv-font-display)", marginBottom: "1.5rem" }}>
          Dashboard coming soon
        </h2>
        <button className="btn btn-brand" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
