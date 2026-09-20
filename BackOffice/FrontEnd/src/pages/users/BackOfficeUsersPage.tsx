import { useEffect, useState } from "react";
import { PeopleFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";
import { UsersTable } from "./UsersTable";

export function BackOfficeUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.users
      .backoffice()
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load BackOffice users.");
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
      title="BackOffice Users"
      subtitle="Admins with access to this BackOffice instance."
      users={users}
      loading={loading}
      error={error}
    />
  );
}
