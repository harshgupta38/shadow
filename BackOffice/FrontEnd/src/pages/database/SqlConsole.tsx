import { useEffect, useRef, useState } from "react";
import { Terminal, Trash } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { Row } from "@/api";

interface RowsResult { kind: "rows"; columns: string[]; rows: Row[]; rowcount: number; ms: number; }
interface ErrorResult { kind: "error"; message: string; }
type QueryResult = RowsResult | ErrorResult | null; // null while the request is in flight

interface HistoryEntry {
  id: number;
  query: string;
  result: QueryResult;
}

const EXAMPLE_QUERIES = [
  "SELECT * FROM users;",
  "SELECT * FROM goals LIMIT 5;",
  "SELECT COUNT(*) FROM tasks;",
  "SELECT title, status FROM milestones;",
];

function ResultTable({ result }: { result: RowsResult }) {
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
      <div className="sql-console-status sql-console-status--ok">
        {result.rows.length > 0
          ? `${result.rows.length} row${result.rows.length === 1 ? "" : "s"} returned`
          : `Query OK, ${result.rowcount} row${result.rowcount === 1 ? "" : "s"} affected`}
        {" "}({(result.ms / 1000).toFixed(3)} sec)
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
  const idRef = useRef(0);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history]);

  async function execute(query: string) {
    if (!query.trim() || running) return;
    idRef.current += 1;
    const id = idRef.current;
    setHistory((prev) => [...prev, { id, query, result: null }]);
    setQueryLog((prev) => [...prev, query]);
    setLogIndex(null);
    setInput("");
    setRunning(true);

    const start = performance.now();
    try {
      const res = await api.database.runQuery(query);
      const ms = performance.now() - start;
      setHistory((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms } }
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
          <span>SQL Console · shadow.db</span>
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

      <div className="sql-console-examples">
        {EXAMPLE_QUERIES.map((q) => (
          <button key={q} type="button" className="sql-console-example-chip" onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="sql-console-body" ref={bodyRef}>
        {history.length === 0 && (
          <div className="sql-console-hint">
            Type a SQL query below and press Enter to run it against shadow.db. Try one of the examples above to get started.
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
            {entry.result?.kind === "rows" && <ResultTable result={entry.result} />}
          </div>
        ))}
      </div>

      <div className="sql-console-input-row">
        <span className="sql-console-prompt-char">db&gt;</span>
        <input
          className="sql-console-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM users;"
          spellCheck={false}
          autoFocus
          disabled={running}
        />
        <button
          type="button"
          className="btn btn-brand sql-console-run-btn"
          onClick={() => execute(input)}
          disabled={!input.trim() || running}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>
    </div>
  );
}
