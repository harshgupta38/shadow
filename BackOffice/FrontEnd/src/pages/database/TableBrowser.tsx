import { useEffect, useMemo, useRef, useState } from "react";
import { Search, PlusLg, Inbox } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { ColumnInfo, Row, TableInfo } from "@/api";
import { Pagination } from "@/components/ui/Pagination/Pagination";
import { rowKey } from "./dbHelpers";
import { RowEditorPanel, type RowEditorPanelHandle } from "./RowEditorPanel";

const DEFAULT_PAGE_SIZE = 25;
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
  const [tableFilter, setTableFilter] = useState("");

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editingRow, setEditingRow] = useState<Row | "create" | null>(null);
  const rowEditorRef = useRef<RowEditorPanelHandle>(null);

  const table = tables.find((t) => t.name === selectedTableName) ?? null;
  const filteredTables = useMemo(() => {
    const term = tableFilter.trim().toLowerCase();
    if (!term) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(term));
  }, [tables, tableFilter]);

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
      const result = await api.database.getRows(selectedTableName, page, pageSize, search);
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
  }, [selectedTableName, page, pageSize, search]);

  function selectTable(name: string) {
    if (name === selectedTableName) return;

    function proceed() {
      setSelectedTableName(name);
      setSearchInput("");
      setSearch("");
      setPage(1);
      setEditingRow(null);
      // Clear immediately, don't wait for the new table's fetch to resolve —
      // otherwise the old table's rows stay visible and clickable for that
      // gap, and clicking one opens the editor with the new table's schema
      // paired with the old table's row data.
      setRows([]);
      setColumns([]);
      setTotal(0);
    }

    if (editingRow !== null && rowEditorRef.current) {
      rowEditorRef.current.confirmNavigateAway(proceed);
    } else {
      proceed();
    }
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

  async function handleRowMutated() {
    setEditingRow(null);
    await refreshAfterMutation();
  }

  return (
    <div className="db-layout">
      <aside className="db-sidebar">
        <div className="db-sidebar-search">
          <Search size={13} />
          <input
            className="form-control"
            placeholder="Search tables…"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          />
        </div>

        <div className="db-sidebar-list">
          {tablesError && (
            <div className="alert alert-danger py-2 px-3 small mb-2" role="alert">{tablesError}</div>
          )}
          {tablesLoading ? (
            <div className="db-table-group-label">Loading tables…</div>
          ) : filteredTables.length === 0 ? (
            <div className="db-table-group-label">No tables match.</div>
          ) : (
            filteredTables.map((t) => (
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
        </div>
      </aside>

      <div className="db-main">
        {!table ? (
          <div className="db-empty-state">
            <Inbox size={30} />
            <p>{tablesLoading ? "Loading…" : "No tables found."}</p>
          </div>
        ) : editingRow !== null ? (
          <RowEditorPanel
            ref={rowEditorRef}
            table={table}
            row={editingRow === "create" ? null : editingRow}
            onClose={() => setEditingRow(null)}
            onSave={handleRowMutated}
            onDelete={handleRowMutated}
          />
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
                  className="btn btn-soft text-nowrap d-flex align-items-center gap-2"
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
                <table className="dp-table db-grid db-grid--clickable">
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
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={rowKey(table, r)} onClick={() => setEditingRow(r)}>
                        {columns.map((col) => (
                          <td key={col.name} className="db-cell">
                            {renderCell(col, r[col.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 10 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
