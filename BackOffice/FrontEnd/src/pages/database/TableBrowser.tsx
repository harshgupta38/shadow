import { Fragment, useEffect, useState } from "react";
import { Search, PlusLg, PencilFill, TrashFill, Inbox } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { ColumnInfo, Row, TableInfo } from "@/api";
import { pkValues, rowKey, rowLabel } from "./dbHelpers";
import { RowEditorModal } from "./RowEditorModal";

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;

function renderCell(col: ColumnInfo, value: unknown) {
  if (value === null || value === undefined) {
    return <span className="db-cell-null">NULL</span>;
  }
  if (col.type === "BOOLEAN") {
    return (
      <span className={`db-cell-bool db-cell-bool--${value ? "true" : "false"}`}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (col.type === "JSON" || typeof value === "object") {
    return <span className="db-cell-json">{JSON.stringify(value)}</span>;
  }
  return <span className="db-cell-text">{String(value)}</span>;
}

export function TableBrowser() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<Row | "create" | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const table = tables.find((t) => t.name === selectedTableName) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Load the table list once.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTablesLoading(true);
      try {
        const list = await api.database.listTables();
        if (cancelled) return;
        setTables(list);
        setTablesError(null);
        if (list.length > 0) setSelectedTableName((prev) => prev ?? list[0].name);
      } catch (err) {
        if (!cancelled) setTablesError(err instanceof ApiError ? err.message : "Could not load tables.");
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Debounce the search box before it drives a fetch.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadRows() {
    if (!selectedTableName) return;
    setRowsLoading(true);
    try {
      const result = await api.database.getRows(selectedTableName, page, PAGE_SIZE, search);
      setColumns(result.columns);
      setRows(result.rows);
      setTotal(result.total);
      setRowsError(null);
    } catch (err) {
      setRowsError(err instanceof ApiError ? err.message : "Could not load rows.");
      setRows([]);
      setTotal(0);
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableName, page, search]);

  function selectTable(name: string) {
    setSelectedTableName(name);
    setSearchInput("");
    setSearch("");
    setPage(1);
    setConfirmDeleteKey(null);
  }

  async function refreshAfterMutation() {
    await loadRows();
    try {
      const list = await api.database.listTables();
      setTables(list);
    } catch {
      // row counts in the sidebar just stay stale until the next successful refresh
    }
  }

  async function handleSaveRow() {
    setEditingRow(null);
    await refreshAfterMutation();
  }

  async function handleDelete(row: Row) {
    if (!table) return;
    try {
      await api.database.deleteRow(table.name, pkValues(table, row));
      setConfirmDeleteKey(null);
      await refreshAfterMutation();
    } catch (err) {
      setRowsError(err instanceof ApiError ? err.message : "Could not delete the row.");
    }
  }

  return (
    <div className="db-layout">
      <aside className="db-sidebar">
        {tablesError && (
          <div className="alert alert-danger py-2 px-3 small mb-2" role="alert">{tablesError}</div>
        )}
        {tablesLoading ? (
          <div className="db-table-group-label">Loading tables…</div>
        ) : (
          tables.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`db-table-item${t.name === selectedTableName ? " db-table-item--active" : ""}`}
              onClick={() => selectTable(t.name)}
            >
              <span className="db-table-item-name">{t.name}</span>
              <span className="db-table-item-count">{t.row_count}</span>
            </button>
          ))
        )}
      </aside>

      <div className="db-main">
        {!table ? (
          <div className="db-empty-state">
            <Inbox size={30} />
            <p>{tablesLoading ? "Loading…" : "No tables found."}</p>
          </div>
        ) : (
          <>
            <div className="db-toolbar">
              <div className="min-w-0">
                <h2 className="db-table-title">{table.name}</h2>
                <p className="db-table-meta">
                  {table.columns.length} columns · {total} row{total === 1 ? "" : "s"}
                </p>
              </div>
              <div className="db-toolbar-actions">
                <div className="db-search">
                  <Search size={14} />
                  <input
                    className="form-control"
                    placeholder="Search rows…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
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

            {rowsError && (
              <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{rowsError}</div>
            )}

            {rows.length === 0 ? (
              <div className="db-empty-state">
                <Inbox size={30} />
                <p>{rowsLoading ? "Loading…" : search ? "No rows match your search." : "No rows in this table yet."}</p>
              </div>
            ) : (
              <div className="dp-table-wrap db-grid-wrap">
                <table className="dp-table db-grid">
                  <thead>
                    <tr>
                      {columns.map((col) => (
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
                    {rows.map((r) => {
                      const key = rowKey(table, r);
                      return (
                        <Fragment key={key}>
                          <tr>
                            {columns.map((col) => (
                              <td key={col.name} className="db-cell">
                                {renderCell(col, r[col.name])}
                              </td>
                            ))}
                            <td>
                              <div className="d-flex gap-1">
                                <button type="button" className="btn-action btn-action--ghost" onClick={() => setEditingRow(r)}>
                                  <PencilFill size={12} />
                                  Edit
                                </button>
                                <button
                                  type="button"
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
                              <td colSpan={columns.length + 1}>
                                <div className="dp-confirm-inner">
                                  <span>
                                    Delete row <strong>{rowLabel(table, r)}</strong> from{" "}
                                    <strong>{table.name}</strong>? This can't be undone.
                                  </span>
                                  <button type="button" className="btn-action btn-action--danger" onClick={() => handleDelete(r)}>
                                    Yes, delete
                                  </button>
                                  <button type="button" className="btn-action btn-action--ghost" onClick={() => setConfirmDeleteKey(null)}>
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
                  type="button"
                  className="btn btn-ghost btn-icon"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`deploy-page-btn${p === page ? " deploy-page-btn--active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {editingRow !== null && table && (
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
