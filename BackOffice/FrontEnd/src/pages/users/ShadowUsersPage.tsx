import { useEffect, useState } from "react";
import { PeopleFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppUser } from "@/api";
import { useToast } from "@/context/ToastContext";
import { UsersTable } from "./UsersTable";
import { DeleteUserModal } from "./delete/DeleteUserModal";

export function ShadowUsersPage() {
  const { success } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);

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

  function handleDeleted(userId: number) {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setDeletingUser(null);
    success("User deleted — their data has been archived to the Deleted Data tab.");
  }

  return (
    <>
      <UsersTable
        icon={<PeopleFill size={20} />}
        title="Shadow Users"
        subtitle="Everyone with an account on Shadow."
        users={users}
        loading={loading}
        error={error}
        onDeleteUser={setDeletingUser}
      />

      {deletingUser && (
        <DeleteUserModal
          key={deletingUser.id}
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
