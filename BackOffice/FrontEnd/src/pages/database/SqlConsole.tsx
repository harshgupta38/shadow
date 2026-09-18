import { useEffect, useRef, useState } from "react";
import { Terminal, Trash } from "react-bootstrap-icons";
import { TABLES, type Row, type TableData } from "./schema";

interface RowsResult { kind: "rows"; columns: string[]; rows: Row[]; ms: number; }
interface StatusResult { kind: "status"; message: string; }
interface ErrorResult { kind: "error"; message: string; }
type QueryResult = RowsResult | StatusResult | ErrorResult;

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

const KNOWN_TABLES = new Set(TABLES.map((t) => t.name));

function runQuery(raw: string, dataByTable: TableData): QueryResult {
  const query = raw.trim().replace(/;$/, "");
  if (!query) return { kind: "error", message: "Empty query." };

  const ms = Math.round(Math.random() * 12 + 2);

  const selectMatch = query.match(/^select\s+(.+?)\s+from\s+([a-z_][a-z0-9_]*)/i);
  if (selectMatch) {
    const [, projection, tableName] = selectMatch;
    if (!KNOWN_TABLES.has(tableName)) {
      return { kind: "error", message: `Error: no such table: ${tableName}` };
    }

    const allRows = dataByTable[tableName] ?? [];

    if (/count\(\*\)/i.test(projection)) {
      return { kind: "rows", columns: ["COUNT(*)"], rows: [{ "COUNT(*)": allRows.length }], ms };
    }

    const limitMatch = query.match(/limit\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : allRows.length;
    const limited = allRows.slice(0, limit);

    const wantsAll = projection.trim() === "*";
    const tableDef = TABLES.find((t) => t.name === tableName);
    const columns = wantsAll
      ? (limited[0] ? Object.keys(limited[0]) : (tableDef?.columns.map((c) => c.name) ?? []))
      : projection.split(",").map((c) => c.trim());

    const rows = wantsAll
      ? limited
      : limited.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));

    return { kind: "rows", columns, rows, ms };
  }

  if (/^(insert|update|delete)\b/i.test(query)) {
    return { kind: "status", message: `Query OK, 1 row affected (${(ms / 1000).toFixed(3)} sec)` };
  }

  if (/^(create|drop|alter|pragma|begin|commit|rollback)\b/i.test(query)) {
    return { kind: "status", message: `Query OK, 0 rows affected (${(ms / 1000).toFixed(3)} sec)` };
  }

  return { kind: "error", message: `Error: syntax error near "${query.split(/\s+/)[0]}"` };
}

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
                <td colSpan={result.columns.length} className="sql-console-empty-cell">
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
        {result.rows.length} row{result.rows.length === 1 ? "" : "s"} returned
        {" "}({(result.ms / 1000).toFixed(3)} sec)
      </div>
    </>
  );
}

interface SqlConsoleProps {
  dataByTable: TableData;
}

export function SqlConsole({ dataByTable }: SqlConsoleProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [queryLog, setQueryLog] = useState<string[]>([]);
  const [logIndex, setLogIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history]);

  function execute(query: string) {
    if (!query.trim()) return;
    const result = runQuery(query, dataByTable);
    idRef.current += 1;
    setHistory((prev) => [...prev, { id: idRef.current, query, result }]);
    setQueryLog((prev) => [...prev, query]);
    setLogIndex(null);
    setInput("");
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

            {entry.result.kind === "error" && (
              <div className="sql-console-status sql-console-status--error">{entry.result.message}</div>
            )}

            {entry.result.kind === "status" && (
              <div className="sql-console-status sql-console-status--ok">{entry.result.message}</div>
            )}

            {entry.result.kind === "rows" && <ResultTable result={entry.result} />}
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
        />
        <button
          type="button"
          className="btn btn-brand sql-console-run-btn"
          onClick={() => execute(input)}
          disabled={!input.trim()}
        >
          Run
        </button>
      </div>
    </div>
  );
}
