import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Terminal, Trash } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { Row } from "@/api";
import { computePageWindow } from "@/components/ui/Pagination/Pagination";

const PAGE_SIZE = 15;

interface RowsResult {
  kind: "rows";
  columns: string[];
  rows: Row[];
  rowcount: number;
  ms: number;
  // null for a statement with no row set to page through (INSERT/UPDATE/
  // DELETE/DDL/...) — everything else (any SELECT shape) always gets one,
  // even a result that already fits on a single page.
  total: number | null;
  page: number;
}
interface ErrorResult { kind: "error"; message: string; }
type QueryResult = RowsResult | ErrorResult | null; // null while the request is in flight

interface HistoryEntry {
  id: number;
  query: string;
  result: QueryResult;
  pageLoading: boolean;
}

const EXAMPLE_QUERIES = [
  "SELECT * FROM users;",
  "SELECT * FROM goals LIMIT 5;",
  "SELECT COUNT(*) FROM tasks;",
  "SELECT title, status FROM milestones;",
];

function ResultTable({ result, loading, onPageChange }: {
  result: RowsResult;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = result.total !== null ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const start = (result.page - 1) * PAGE_SIZE + 1;
  const end = result.total !== null ? Math.min(result.page * PAGE_SIZE, result.total) : result.rows.length;
  const { pages, showEllipsis } = computePageWindow(result.page, totalPages);

  return (
    <>
      <div className="sql-console-result-wrap">
        <table className="sql-console-result-table">
          <thead>
            <tr>
              {result.columns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={result.columns.length || 1} className="sql-console-empty-cell">
                  (0 rows)
                </td>
              </tr>
            ) : (
              result.rows.map((r, i) => (
                <tr key={i}>
                  {result.columns.map((c) => (
                    <td key={c}>
                      {r[c] === null || r[c] === undefined ? (
                        <span className="db-cell-null">NULL</span>
                      ) : typeof r[c] === "object" ? (
                        JSON.stringify(r[c])
                      ) : (
                        String(r[c])
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="sql-console-status sql-console-status--ok d-flex align-items-center justify-content-between">
        <span>
          {result.total === null
            ? `Query OK, ${result.rowcount} row${result.rowcount === 1 ? "" : "s"} affected`
            : result.total <= PAGE_SIZE
            ? `${result.total} row${result.total === 1 ? "" : "s"} returned`
            : `Showing ${start} - ${end} of ${result.total} rows`}
          {" "}({(result.ms / 1000).toFixed(3)} sec)
        </span>

        {result.total !== null && totalPages > 1 && (
          <span className="sql-console-pager">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={result.page <= 1 || loading}
              onClick={() => onPageChange(result.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={12} />
            </button>

            {pages.map((p) => (
              <button
                key={p}
                type="button"
                className={`sql-console-page-btn${p === result.page ? " sql-console-page-btn--active" : ""}`}
                onClick={() => onPageChange(p)}
                disabled={loading}
              >
                {p}
              </button>
            ))}

            {showEllipsis && (
              <>
                <span className="pagination-ellipsis">…</span>
                <button
                  type="button"
                  className="sql-console-page-btn"
                  onClick={() => onPageChange(totalPages)}
                  disabled={loading}
                >
                  {totalPages}
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={result.page >= totalPages || loading}
              onClick={() => onPageChange(result.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </span>
        )}
      </div>
    </>
  );
}

export function SqlConsole() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [queryLog, setQueryLog] = useState<string[]>([]);
  const [logIndex, setLogIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history]);

  async function execute(query: string) {
    if (!query.trim() || running) return;
    idRef.current += 1;
    const id = idRef.current;
    setHistory((prev) => [...prev, { id, query, result: null, pageLoading: false }]);
    setQueryLog((prev) => [...prev, query]);
    setLogIndex(null);
    setInput("");
    setRunning(true);

    const start = performance.now();
    try {
      const res = await api.database.runQuery(query, 1, PAGE_SIZE);
      const ms = performance.now() - start;
      setHistory((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms, total: res.total, page: res.page } }
          : e
      )));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Query failed.";
      setHistory((prev) => prev.map((e) => (
        e.id === id ? { ...e, result: { kind: "error", message } } : e
      )));
    } finally {
      setRunning(false);
    }
  }

  // Re-runs an already-executed entry's query at a different page — the
  // result swaps in place, same as flipping a page in a real terminal's
  // scrollback rather than opening a new prompt.
  async function changePage(entry: HistoryEntry, page: number) {
    if (entry.result?.kind !== "rows" || page === entry.result.page) return;
    setHistory((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pageLoading: true } : e)));

    const start = performance.now();
    try {
      const res = await api.database.runQuery(entry.query, page, PAGE_SIZE);
      const ms = performance.now() - start;
      setHistory((prev) => prev.map((e) => (
        e.id === entry.id
          ? { ...e, pageLoading: false, result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms, total: res.total, page: res.page } }
          : e
      )));
    } catch {
      // Keep whatever page was already showing rather than replacing good
      // data with an error — a transient page-change failure isn't worth
      // losing the visible result over.
      setHistory((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pageLoading: false } : e)));
    }
  }

  // Clicking the terminal's own empty space (not a past result table, not
  // selecting old output text) drops focus onto the live input line, the
  // way a real terminal — or a Jupyter cell — puts the cursor back to work
  // no matter where in the blank area below the last line you click.
  function handleBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      execute(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (queryLog.length === 0) return;
      const nextIndex = logIndex === null ? queryLog.length - 1 : Math.max(0, logIndex - 1);
      setLogIndex(nextIndex);
      setInput(queryLog[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (logIndex === null) return;
      const nextIndex = logIndex + 1;
      if (nextIndex >= queryLog.length) {
        setLogIndex(null);
        setInput("");
      } else {
        setLogIndex(nextIndex);
        setInput(queryLog[nextIndex]);
      }
    }
  }

  return (
    <div className="sql-console-wrap">
      <div className="sql-console-header">
        <div className="d-flex align-items-center gap-2">
          <Terminal size={13} />
          <span>SQL Console</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setHistory([])}
          aria-label="Clear console"
          disabled={history.length === 0}
        >
          <Trash size={13} />
        </button>
      </div>

      <div className="sql-console-body" ref={bodyRef} onClick={handleBodyClick}>
        {history.length === 0 && (
          <div className="sql-console-hint">
            Type a SQL query below and press Enter to run it against shadow.db. Try one of the examples below to get started.
          </div>
        )}
        {history.map((entry) => (
          <div key={entry.id} className="sql-console-entry">
            <div className="sql-console-query-line">
              <span className="sql-console-prompt-char">db&gt;</span> {entry.query}
            </div>

            {entry.result === null && (
              <div className="sql-console-status">Running…</div>
            )}
            {entry.result?.kind === "error" && (
              <div className="sql-console-status sql-console-status--error">{entry.result.message}</div>
            )}
            {entry.result?.kind === "rows" && (
              <ResultTable
                result={entry.result}
                loading={entry.pageLoading}
                onPageChange={(page) => changePage(entry, page)}
              />
            )}
          </div>
        ))}

        <div className="sql-console-input-row">
          <span className="sql-console-prompt-char">db&gt;</span>
          <input
            ref={inputRef}
            className="sql-console-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM users;"
            spellCheck={false}
            autoFocus
            disabled={running}
          />
        </div>
      </div>

      <div className="sql-console-examples">
        {EXAMPLE_QUERIES.map((q) => (
          <button key={q} type="button" className="sql-console-example-chip" onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
