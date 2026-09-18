import { Fragment, useMemo, useState } from "react";
import { Search, PlusLg, PencilFill, TrashFill, Inbox } from "react-bootstrap-icons";
import { TABLES, getTable, MOCK_ROWS, rowKey, rowLabel, type ColumnDef, type Row } from "./schema";
import { RowEditorModal } from "./RowEditorModal";

const PAGE_SIZE = 8;
const GROUPS = ["Core", "System"] as const;

function renderCell(col: ColumnDef, value: unknown) {
  if (value === null || value === undefined) {
    return <span className="db-cell-null">NULL</span>;
  }
  if (col.type === "boolean") {
    return (
      <span className={`db-cell-bool db-cell-bool--${value ? "true" : "false"}`}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (col.type === "json") {
    return <span className="db-cell-json">{JSON.stringify(value)}</span>;
  }
  return <span className="db-cell-text">{String(value)}</span>;
}

export function TableBrowser() {
  const [selectedTableName, setSelectedTableName] = useState("users");
  const [dataByTable, setDataByTable] = useState<Record<string, Row[]>>(
    () => structuredClone(MOCK_ROWS),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<Row | "create" | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const table = getTable(selectedTableName)!;
  const rows = dataByTable[selectedTableName] ?? [];

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => JSON.stringify(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  // Clamp so a shrinking result set (search, delete) never strands the view on an empty page.
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function selectTable(name: string) {
    setSelectedTableName(name);
    setSearch("");
    setPage(1);
    setConfirmDeleteKey(null);
  }

  function handleSaveRow(updated: Row) {
    setDataByTable((prev) => {
      const existing = prev[selectedTableName] ?? [];
      const idx = existing.findIndex((r) => rowKey(table, r) === rowKey(table, updated));
      const next =
        idx >= 0
          ? existing.map((r, i) => (i === idx ? updated : r))
          : [updated, ...existing];
      return { ...prev, [selectedTableName]: next };
    });
    setEditingRow(null);
  }

  function handleDelete(key: string) {
    setDataByTable((prev) => ({
      ...prev,
      [selectedTableName]: (prev[selectedTableName] ?? []).filter((r) => rowKey(table, r) !== key),
    }));
    setConfirmDeleteKey(null);
  }

  return (
    <div className="db-layout">
      <aside className="db-sidebar">
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="db-table-group-label">{group}</div>
            {TABLES.filter((t) => t.group === group).map((t) => (
              <button
                key={t.name}
                type="button"
                className={`db-table-item${t.name === selectedTableName ? " db-table-item--active" : ""}`}
                onClick={() => selectTable(t.name)}
              >
                <span className="db-table-item-name">{t.name}</span>
                <span className="db-table-item-count">{(dataByTable[t.name] ?? []).length}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="db-main">
        <div className="db-toolbar">
          <div className="min-w-0">
            <h2 className="db-table-title">{table.name}</h2>
            <p className="db-table-meta">
              {table.columns.length} columns · {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="db-toolbar-actions">
            <div className="db-search">
              <Search size={14} />
              <input
                className="form-control"
                placeholder="Search rows…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <button
              type="button"
              className="btn btn-brand text-nowrap d-flex align-items-center gap-2"
              onClick={() => setEditingRow("create")}
            >
              <PlusLg size={14} />
              Add row
            </button>
          </div>
        </div>

        {pageRows.length === 0 ? (
          <div className="db-empty-state">
            <Inbox size={30} />
            <p>No rows {search ? "match your search" : "in this table yet"}.</p>
          </div>
        ) : (
          <div className="dp-table-wrap db-grid-wrap">
            <table className="dp-table db-grid">
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th key={col.name}>
                      <span className="d-inline-flex align-items-center gap-1">
                        {col.name}
                        {col.pk && <span className="db-col-badge db-col-badge--pk">PK</span>}
                        {col.fk && <span className="db-col-badge db-col-badge--fk">FK</span>}
                      </span>
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const key = rowKey(table, r);
                  return (
                    <Fragment key={key}>
                      <tr>
                        {table.columns.map((col) => (
                          <td key={col.name} className="db-cell">
                            {renderCell(col, r[col.name])}
                          </td>
                        ))}
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn-action btn-action--ghost" onClick={() => setEditingRow(r)}>
                              <PencilFill size={12} />
                              Edit
                            </button>
                            <button
                              className="btn-action btn-action--danger"
                              onClick={() => setConfirmDeleteKey(confirmDeleteKey === key ? null : key)}
                            >
                              <TrashFill size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {confirmDeleteKey === key && (
                        <tr className="dp-confirm-row">
                          <td colSpan={table.columns.length + 1}>
                            <div className="dp-confirm-inner">
                              <span>
                                Delete row <strong>{rowLabel(table, r)}</strong> from{" "}
                                <strong>{table.name}</strong>? This can't be undone.
                              </span>
                              <button className="btn-action btn-action--danger" onClick={() => handleDelete(key)}>
                                Yes, delete
                              </button>
                              <button className="btn-action btn-action--ghost" onClick={() => setConfirmDeleteKey(null)}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="deploy-pagination">
            <button
              className="btn btn-ghost btn-icon"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`deploy-page-btn${p === safePage ? " deploy-page-btn--active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-icon"
              disabled={safePage === totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {editingRow !== null && (
        <RowEditorModal
          table={table}
          row={editingRow === "create" ? null : editingRow}
          onClose={() => setEditingRow(null)}
          onSave={handleSaveRow}
        />
      )}
    </div>
  );
}
