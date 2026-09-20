import { useEffect, useState } from "react";
import { PeopleFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";
import { UsersTable } from "./UsersTable";

export function ShadowUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.users
      .shadow()
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load Shadow users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <UsersTable
      icon={<PeopleFill size={20} />}
      title="Shadow Users"
      subtitle="Everyone with an account on Shadow."
      users={users}
      loading={loading}
      error={error}
    />
  );
}
