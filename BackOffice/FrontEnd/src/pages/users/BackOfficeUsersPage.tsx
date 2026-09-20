import { useEffect, useState } from "react";
import { PeopleFill, PersonPlusFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";
import { useToast } from "@/context/ToastContext";
import { UsersTable } from "./UsersTable";
import { AddUserDialog } from "./AddUserDialog";

export function BackOfficeUsersPage() {
  const { success } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

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

  function handleCreated(user: AppUser) {
    setUsers((prev) => [...prev, user]);
    setShowAddUser(false);
    success(`Account created for ${user.name}.`);
  }

  return (
    <>
      <UsersTable
        icon={<PeopleFill size={20} />}
        title="BackOffice Users"
        subtitle="Admins with access to this BackOffice instance."
        users={users}
        loading={loading}
        error={error}
        headerActions={
          <button
            type="button"
            className="btn btn-brand d-flex align-items-center gap-2"
            onClick={() => setShowAddUser(true)}
          >
            <PersonPlusFill size={14} />
            Add User
          </button>
        }
      />

      {showAddUser && (
        <AddUserDialog onClose={() => setShowAddUser(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
