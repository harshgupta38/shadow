import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, Inbox } from "react-bootstrap-icons";
import { Pagination } from "@/components/ui/Pagination/Pagination";
import { formatDate } from "@/lib/format";
import type { AppUser, UserStatus } from "@/api";

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  away: "Away",
  inactive: "Inactive",
};

const STATUS_VARIANT: Record<UserStatus, "success" | "warn" | "danger"> = {
  active: "success",
  away: "warn",
  inactive: "danger",
};

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

interface UsersTableProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  users: AppUser[];
  loading: boolean;
  error?: string | null;
  // Rendered immediately before the search box (e.g. BackOffice's own
  // "Add User" button) — omitted entirely by pages that don't need it, such
  // as Shadow's read-only Users page.
  headerActions?: ReactNode;
}

// Reusable across every "Users" page in BackOffice — Shadow V2's users and
// BackOffice's own admins both render through this same table, each page
// only supplying its own data (see ShadowUsersPage / BackOfficeUsersPage).
// Owns its own header row (title + search) rather than using the generic
// PageHeader, since the search box needs to live in that same row.
export function UsersTable({ icon, title, subtitle, users, loading, error, headerActions }: UsersTableProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = useMemo(() => {
    if (!search) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search),
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageUsers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <div className="page-header-jv users-table-header d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div className="page-header-jv-main d-flex align-items-center gap-3 min-w-0">
          <div className="stat-icon">{icon}</div>
          <div className="min-w-0">
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle text-muted-2 mb-0">{subtitle}</p>}
          </div>
        </div>

        <div className="db-toolbar-actions flex-shrink-0">
          {headerActions}
          <div className="db-search">
            <Search size={14} />
            <input
              className="form-control"
              placeholder="Search by name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{error}</div>
      )}

      {pageUsers.length === 0 ? (
        <div className="db-empty-state">
          <Inbox size={30} />
          <p>{loading ? "Loading…" : search ? "No users match your search." : "No users found."}</p>
        </div>
      ) : (
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((u) => (
                <tr key={u.id}>
                  <td style={{ color: "var(--jv-faint)" }}>{u.id}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="avatar avatar-sm">{initials(u.name)}</span>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--jv-muted)" }}>
                    <div className="d-flex align-items-center gap-2">
                      <span>{u.email}</span>
                      {u.email_verified !== null && (
                        <span className={`verified-pill verified-pill--${u.email_verified ? "yes" : "no"}`}>
                          {u.email_verified ? "Verified" : "Unverified"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`dp-status-dot dp-status-dot--${STATUS_VARIANT[u.status]}`}>
                      {STATUS_LABEL[u.status]}
                    </span>
                  </td>
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>
                    {formatDate(u.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 10 && (
        <Pagination
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </>
  );
}
