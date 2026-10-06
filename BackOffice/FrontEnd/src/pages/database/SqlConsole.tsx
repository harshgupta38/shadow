import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClockHistory, Terminal, Trash } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { AppTarget, Row, SqlHistoryEntry } from "@/api";
import { computePageWindow } from "@/components/ui/Pagination/Pagination";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 15;
// Matches the server's cap, so the list the console holds is what a reload would bring back.
const MAX_SAVED = 30;

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

// One run in the scrollback of THIS visit to the console. (Not to be confused with the saved
// history kept on the server, which survives reloads — see SqlHistoryEntry.)
interface HistoryEntry {
  id: number;
  query: string;
  result: QueryResult;
  pageLoading: boolean;
}

const EXAMPLE_QUERIES: Record<AppTarget, string[]> = {
  shadow: [
    "SELECT * FROM users;",
    "SELECT * FROM goals LIMIT 5;",
    "SELECT COUNT(*) FROM tasks;",
    "SELECT title, status FROM milestones;",
  ],
  backoffice: [
    "SELECT * FROM admin_users;",
    "SELECT * FROM deployment_logs ORDER BY started_at DESC LIMIT 5;",
    "SELECT * FROM restart_logs ORDER BY started_at DESC LIMIT 5;",
    "SELECT COUNT(*) FROM sql_audit_logs;",
  ],
};

function ResultTable({ result, loading, onPageChange, readOnly = false }: {
  result: RowsResult;
  loading: boolean;
  onPageChange?: (page: number) => void;
  // A saved output has nothing live to page through: it is only the first page as it was.
  readOnly?: boolean;
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

        {result.total !== null && totalPages > 1 && !readOnly && onPageChange && (
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

function savedAsRowsResult(entry: SqlHistoryEntry): RowsResult | null {
  const r = entry.result;
  if (!entry.success || r === null) return null;
  return { kind: "rows", columns: r.columns, rows: r.rows, rowcount: r.rowcount, ms: entry.duration_ms ?? 0, total: r.total, page: 1 };
}

export function SqlConsole({ app }: { app: AppTarget }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // The last runs saved on the server (newest first) — what ↑ walks through, and what a reload brings back.
  const [saved, setSaved] = useState<SqlHistoryEntry[]>([]);
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [running, setRunning] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const idRef = useRef(0);
  // What was typed before ↑ started walking through saved queries, so walking back down restores it.
  const draftRef = useRef("");

  const recalled = recallIndex !== null ? saved[recallIndex] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    api.database.sqlHistory(app)
      .then((list) => { if (!cancelled) setSaved(list); })
      .catch(() => { /* history is a convenience — the console works without it */ });
    return () => { cancelled = true; };
  }, [app]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history, recalled]);

  // Close the history list when clicking anywhere outside it.
  useEffect(() => {
    if (!showHistory) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (historyPanelRef.current?.contains(target) || historyButtonRef.current?.contains(target)) return;
      setShowHistory(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showHistory]);

  // Keeps the local copy in step with what the server just saved, so ↑ works straight away
  // without re-downloading the list. Repeating the newest query replaces it, as on the server.
  function rememberRun(query: string, outcome: Pick<SqlHistoryEntry, "success" | "result" | "error_message" | "duration_ms">) {
    const entry: SqlHistoryEntry = {
      id: -Date.now(), query, truncated: false, executed_at: new Date().toISOString(), ...outcome,
    };
    setSaved((prev) => [entry, ...(prev[0]?.query === query ? prev.slice(1) : prev)].slice(0, MAX_SAVED));
  }

  async function execute(query: string) {
    if (!query.trim() || running) return;
    idRef.current += 1;
    const id = idRef.current;
    setHistory((prev) => [...prev, { id, query, result: null, pageLoading: false }]);
    setRecallIndex(null);
    setShowHistory(false);
    setInput("");
    setRunning(true);

    const start = performance.now();
    try {
      const res = await api.database.runQuery(app, query, 1, PAGE_SIZE);
      const ms = performance.now() - start;
      setHistory((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms, total: res.total, page: res.page } }
          : e
      )));
      rememberRun(query, { success: true, result: res, error_message: null, duration_ms: Math.round(ms) });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Query failed.";
      setHistory((prev) => prev.map((e) => (
        e.id === id ? { ...e, result: { kind: "error", message } } : e
      )));
      rememberRun(query, { success: false, result: null, error_message: message, duration_ms: Math.round(performance.now() - start) });
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
      // Not a new query, so it isn't added to the saved history.
      const res = await api.database.runQuery(app, entry.query, page, PAGE_SIZE, false);
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

  // Puts saved entry `index` (or the draft, for null) on the prompt and shows its saved output.
  function recall(index: number | null) {
    if (index !== null && recallIndex === null) draftRef.current = input;
    setRecallIndex(index);
    setInput(index === null ? draftRef.current : saved[index].query);
  }

  function pickFromList(index: number) {
    recall(index);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  async function clearSaved() {
    try {
      await api.database.clearSqlHistory(app);
      setSaved([]);
      setRecallIndex(null);
      setShowHistory(false);
    } catch {
      // Leave the list as it is if the server couldn't clear it, rather than pretending it's gone.
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
      if (saved.length === 0) return;
      recall(recallIndex === null ? 0 : Math.min(recallIndex + 1, saved.length - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (recallIndex === null) return;
      recall(recallIndex === 0 ? null : recallIndex - 1);
    } else if (e.key === "Escape") {
      if (recallIndex !== null) {
        e.preventDefault();
        recall(null);
      } else if (showHistory) {
        setShowHistory(false);
      }
    }
  }

  const recalledRows = recalled ? savedAsRowsResult(recalled) : null;

  return (
    <div className="sql-console-wrap">
      <div className="sql-console-header">
        <div className="d-flex align-items-center gap-2">
          <Terminal size={13} />
          <span>SQL Console</span>
        </div>
        <div className="d-flex align-items-center gap-1">
          <button
            ref={historyButtonRef}
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setShowHistory((open) => !open)}
            aria-label="Query history"
            title="Query history — or press ↑ in the prompt"
            disabled={saved.length === 0}
          >
            <ClockHistory size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setHistory([])}
            aria-label="Clear console"
            title="Clear the screen (saved history is kept)"
            disabled={history.length === 0}
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="sql-console-history-panel" ref={historyPanelRef}>
          <div className="sql-console-history-head">
            <span>Last {saved.length} quer{saved.length === 1 ? "y" : "ies"} · click one to see its saved output</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearSaved}>Clear history</button>
          </div>
          {saved.map((e, i) => (
            <button key={e.id} type="button" className="sql-console-history-item" onClick={() => pickFromList(i)}>
              <span className={`sql-console-history-dot sql-console-history-dot--${e.success ? "ok" : "err"}`} />
              <span className="sql-console-history-query">{e.query}</span>
              <span className="sql-console-history-meta">{formatRelative(e.executed_at)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sql-console-body" ref={bodyRef} onClick={handleBodyClick}>
        {history.length === 0 && (
          <div className="sql-console-hint">
            Type a SQL query below and press Enter to run it against {app === "shadow" ? "shadow.db" : "backoffice.db"}. Try one of the examples below to get started.
            {saved.length > 0 && ` Press ↑ to bring back your last ${saved.length} quer${saved.length === 1 ? "y" : "ies"} along with what they returned.`}
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

        {recalled && (
          <div className="sql-console-entry sql-console-entry--saved">
            <div className="sql-console-saved-label">
              Saved output · ran {formatRelative(recalled.executed_at)} · Enter runs it again · Esc dismisses
            </div>
            <div className="sql-console-query-line">
              <span className="sql-console-prompt-char">db&gt;</span> {recalled.query}
            </div>
            {recalledRows ? (
              <ResultTable result={recalledRows} loading={false} readOnly />
            ) : (
              <div className="sql-console-status sql-console-status--error">{recalled.error_message ?? "Query failed."}</div>
            )}
            {recalled.truncated && recalled.result && (
              <div className="sql-console-status">
                Only the first {recalled.result.rows.length} rows of this result were saved — run it again for the rest.
              </div>
            )}
          </div>
        )}

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
        {EXAMPLE_QUERIES[app].map((q) => (
          <button key={q} type="button" className="sql-console-example-chip" onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
