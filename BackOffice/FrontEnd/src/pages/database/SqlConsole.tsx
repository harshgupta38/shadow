import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClockHistory, PlayFill, SkipEndFill, StopFill, Terminal, Trash } from "react-bootstrap-icons";
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
  // Set for a run brought back from the saved history when the console opened: when it originally ran.
  restoredAt?: string;
  // Set when only the first N rows of a restored result were saved.
  keptRows?: number;
  // Set when this entry is a pasted script run statement by statement rather than a single query.
  script?: ScriptRun;
}

// A pasted script runs one statement at a time, so a failure shows exactly where it happened and the
// run can pick up from there.
type StepState = "queued" | "running" | "done" | "failed" | "skipped";
interface ScriptStep {
  sql: string;
  state: StepState;
  result: QueryResult;
  pageLoading: boolean;
  // Why a step was skipped, when that wasn't the person's choice.
  note?: string;
}
type ScriptStatus = "running" | "done" | "failed" | "stopped";
interface ScriptRun {
  steps: ScriptStep[];
  status: ScriptStatus;
}

// BEGIN/COMMIT/ROLLBACK/SAVEPOINT/RELEASE only mean something within one connection, and each
// statement here runs (and commits) on its own, so they can't wrap the others. Allows leading comments,
// which the splitter keeps attached to the statement that follows them.
const TRANSACTION_CONTROL = /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
const TRANSACTION_NOTE = "Skipped — each statement runs and commits on its own here, so BEGIN / COMMIT have no effect.";

// Anything with a semicolon before the very end might be several statements and is worth sending to be
// split. (A single statement, even one with a trailing semicolon, skips the extra round trip.)
function mayBeScript(text: string): boolean {
  return text.trim().replace(/;\s*$/, "").includes(";");
}

function describeScript(script: ScriptRun): string {
  const total = script.steps.length;
  const done = script.steps.filter((st) => st.state === "done").length;
  const notRun = script.steps.filter((st) => st.state === "queued" || st.state === "failed").length;
  const running = script.steps.findIndex((st) => st.state === "running");
  switch (script.status) {
    case "running": return `running statement ${running + 1} of ${total}`;
    case "done": return `finished — ${done} of ${total} statements ran`;
    case "failed": {
      const at = script.steps.findIndex((st) => st.state === "failed");
      return `stopped at statement ${at + 1} of ${total} — ${notRun - 1} after it not run`;
    }
    case "stopped": return `stopped — ${notRun} of ${total} statements not run`;
  }
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
      {result.columns.length > 0 && (
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
      )}
      <div className="sql-console-status sql-console-status--ok d-flex align-items-center justify-content-between">
        <span>
          {result.total === null
            ? (result.rowcount < 0 ? "Query OK" : `Query OK, ${result.rowcount} row${result.rowcount === 1 ? "" : "s"} affected`)
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

// The saved history (newest first) laid out as scrollback, oldest first — so reopening the console
// shows what you ran before, with its output, the way a terminal restores its last session.
function savedAsScrollback(saved: SqlHistoryEntry[], nextId: () => number): HistoryEntry[] {
  return saved.slice().reverse().map((entry) => ({
    id: nextId(),
    query: entry.query,
    pageLoading: false,
    restoredAt: entry.executed_at,
    keptRows: entry.truncated && entry.result ? entry.result.rows.length : undefined,
    result: savedAsRowsResult(entry) ?? { kind: "error", message: entry.error_message ?? "Query failed." },
  }));
}

type RunOutcome = { ok: true; result: RowsResult } | { ok: false; message: string };

export function SqlConsole({ app }: { app: AppTarget }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // The last runs saved on the server (newest first) — what ↑ walks through, and what a reload brings back.
  const [saved, setSaved] = useState<SqlHistoryEntry[]>([]);
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [running, setRunning] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const idRef = useRef(0);
  // Set by the Stop button; checked between the statements of a running script.
  const stopRef = useRef(false);
  // What was typed before ↑ started walking through saved queries, so walking back down restores it.
  const draftRef = useRef("");

  const recalled = recallIndex !== null ? saved[recallIndex] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    api.database.sqlHistory(app)
      .then((list) => {
        if (cancelled) return;
        setSaved(list);
        // Ahead of anything already run since the console opened.
        setHistory((prev) => [...savedAsScrollback(list, () => (idRef.current += 1)), ...prev]);
      })
      .catch(() => { /* history is a convenience — the console works without it */ });
    return () => { cancelled = true; };
  }, [app]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history, recalled]);

  // The prompt grows with what is typed or pasted, so a whole script is readable before it runs.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // The prompt is disabled while something runs, which drops its focus; hand it back afterwards
  // (unless the person has clicked somewhere else in the meantime).
  useEffect(() => {
    if (!running && (document.activeElement === document.body || document.activeElement === null)) {
      inputRef.current?.focus();
    }
  }, [running]);

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

  // Runs one statement (first page) and records it in the saved history.
  async function runOne(sql: string): Promise<RunOutcome> {
    const start = performance.now();
    try {
      const res = await api.database.runQuery(app, sql, 1, PAGE_SIZE);
      const ms = performance.now() - start;
      rememberRun(sql, { success: true, result: res, error_message: null, duration_ms: Math.round(ms) });
      return { ok: true, result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms, total: res.total, page: res.page } };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Query failed.";
      rememberRun(sql, { success: false, result: null, error_message: message, duration_ms: Math.round(performance.now() - start) });
      return { ok: false, message };
    }
  }

  function addEntry(entry: Omit<HistoryEntry, "id">): number {
    idRef.current += 1;
    const id = idRef.current;
    setHistory((prev) => [...prev, { id, ...entry }]);
    return id;
  }

  async function runSingle(query: string) {
    const id = addEntry({ query, result: null, pageLoading: false });
    const outcome = await runOne(query);
    setHistory((prev) => prev.map((e) => (
      e.id === id ? { ...e, result: outcome.ok ? outcome.result : { kind: "error", message: outcome.message } } : e
    )));
  }

  function patchScript(id: number, update: (script: ScriptRun) => ScriptRun) {
    setHistory((prev) => prev.map((e) => (e.id === id && e.script ? { ...e, script: update(e.script) } : e)));
  }

  function patchStep(id: number, index: number, patch: Partial<ScriptStep>) {
    patchScript(id, (script) => ({
      ...script,
      steps: script.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  // Runs the script's statements one after another from `from`, one request at a time. The first
  // failure stops it right there (the later statements are left untouched), so the person sees which
  // statement broke and can fix things and resume from it.
  async function runSteps(id: number, statements: string[], from: number) {
    stopRef.current = false;
    patchScript(id, (script) => ({ ...script, status: "running" }));
    for (let i = from; i < statements.length; i++) {
      if (TRANSACTION_CONTROL.test(statements[i])) {
        patchStep(id, i, { state: "skipped", note: TRANSACTION_NOTE });
        continue;
      }
      if (stopRef.current) {
        patchScript(id, (script) => ({ ...script, status: "stopped" }));
        return;
      }
      patchStep(id, i, { state: "running", result: null, note: undefined });
      const outcome = await runOne(statements[i]);
      if (!outcome.ok) {
        patchStep(id, i, { state: "failed", result: { kind: "error", message: outcome.message } });
        patchScript(id, (script) => ({ ...script, status: "failed" }));
        return;
      }
      patchStep(id, i, { state: "done", result: outcome.result });
    }
    patchScript(id, (script) => ({ ...script, status: "done" }));
  }

  async function runScript(statements: string[]) {
    const steps: ScriptStep[] = statements.map((sql) => (
      TRANSACTION_CONTROL.test(sql)
        ? { sql, state: "skipped", result: null, pageLoading: false, note: TRANSACTION_NOTE }
        : { sql, state: "queued", result: null, pageLoading: false }
    ));
    const id = addEntry({ query: statements.join("\n"), result: null, pageLoading: false, script: { steps, status: "running" } });
    await runSteps(id, statements, 0);
  }

  async function execute(query: string) {
    if (!query.trim() || running) return;
    setRecallIndex(null);
    setShowHistory(false);
    setInput("");
    setRunning(true);
    try {
      let statements = [query];
      if (mayBeScript(query)) {
        try {
          statements = await api.database.splitSql(app, query);
        } catch (err) {
          addEntry({ query, pageLoading: false, result: { kind: "error", message: err instanceof ApiError ? err.message : "Could not read that script." } });
          return;
        }
      }
      if (statements.length > 1) await runScript(statements);
      else await runSingle(query);
    } finally {
      setRunning(false);
    }
  }

  // Picks a stopped or failed script back up. `from` is the statement to start at.
  async function resumeScript(entry: HistoryEntry, from: number) {
    if (!entry.script || running) return;
    setRunning(true);
    try {
      await runSteps(entry.id, entry.script.steps.map((step) => step.sql), from);
    } finally {
      setRunning(false);
    }
  }

  async function skipAndContinue(entry: HistoryEntry, index: number) {
    patchStep(entry.id, index, { state: "skipped", note: "Skipped by you." });
    await resumeScript(entry, index + 1);
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

  // Same as changePage, for one statement of a script.
  async function changeStepPage(entry: HistoryEntry, index: number, page: number) {
    const step = entry.script?.steps[index];
    if (!step || step.result?.kind !== "rows" || page === step.result.page) return;
    patchStep(entry.id, index, { pageLoading: true });
    const start = performance.now();
    try {
      const res = await api.database.runQuery(app, step.sql, page, PAGE_SIZE, false);
      const ms = performance.now() - start;
      patchStep(entry.id, index, {
        pageLoading: false,
        result: { kind: "rows", columns: res.columns, rows: res.rows, rowcount: res.rowcount, ms, total: res.total, page: res.page },
      });
    } catch {
      patchStep(entry.id, index, { pageLoading: false });
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const field = e.currentTarget;
    if (e.key === "Enter") {
      // Shift+Enter adds a line (for typing a script); Enter runs what's there.
      if (e.shiftKey) return;
      e.preventDefault();
      execute(input);
    } else if (e.key === "ArrowUp") {
      // Within a multi-line script ↑ moves between its lines; only from the first line does it recall.
      if (field.value.slice(0, field.selectionStart).includes("\n")) return;
      e.preventDefault();
      if (saved.length === 0) return;
      recall(recallIndex === null ? 0 : Math.min(recallIndex + 1, saved.length - 1));
    } else if (e.key === "ArrowDown") {
      if (field.value.slice(field.selectionEnd).includes("\n")) return;
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

  function renderScript(entry: HistoryEntry, script: ScriptRun) {
    const total = script.steps.length;
    const failedAt = script.steps.findIndex((st) => st.state === "failed");
    const nextAt = script.steps.findIndex((st) => st.state === "queued" || st.state === "failed");
    const hasTransactionControl = script.steps.some((st) => st.note === TRANSACTION_NOTE);
    return (
      <div key={entry.id} className="sql-console-entry sql-console-script">
        <div className="sql-console-script-head">
          <span className="sql-console-prompt-char">db&gt;</span>
          <span>script of {total} statements</span>
          <span className={`sql-console-script-status sql-console-script-status--${script.status}`}>{describeScript(script)}</span>
          {script.status === "running" && (
            <button type="button" className="btn btn-ghost btn-sm d-flex align-items-center gap-1" onClick={() => { stopRef.current = true; }}>
              <StopFill size={11} /> Stop after this statement
            </button>
          )}
        </div>
        {hasTransactionControl && (
          <div className="sql-console-script-warn">
            This script has BEGIN / COMMIT. Statements run one at a time and each commits by itself, so it is not all-or-nothing — if one fails, the earlier ones stay applied.
          </div>
        )}

        {script.steps.map((step, i) => (
          <div key={i} className={`sql-console-step sql-console-step--${step.state}`}>
            <div className="sql-console-query-line">
              <span className="sql-console-step-no">{i + 1}/{total}</span>
              {step.sql}
            </div>
            {step.state === "queued" && <div className="sql-console-status">Waiting…</div>}
            {step.state === "running" && <div className="sql-console-status">Running…</div>}
            {step.state === "skipped" && <div className="sql-console-status">{step.note ?? "Skipped."}</div>}
            {step.result?.kind === "error" && (
              <div className="sql-console-status sql-console-status--error">{step.result.message}</div>
            )}
            {step.result?.kind === "rows" && (
              <ResultTable
                result={step.result}
                loading={step.pageLoading}
                onPageChange={(page) => changeStepPage(entry, i, page)}
              />
            )}
          </div>
        ))}

        {script.status === "failed" && failedAt >= 0 && (
          <div className="sql-console-script-actions">
            <span>Statement {failedAt + 1} failed, so nothing after it ran. Fix the cause, then:</span>
            <button type="button" className="btn btn-soft btn-sm d-flex align-items-center gap-1" disabled={running} onClick={() => resumeScript(entry, failedAt)}>
              <PlayFill size={12} /> Resume from statement {failedAt + 1}
            </button>
            <button type="button" className="btn btn-ghost btn-sm d-flex align-items-center gap-1" disabled={running} onClick={() => skipAndContinue(entry, failedAt)}>
              <SkipEndFill size={12} /> Skip it and continue
            </button>
          </div>
        )}
        {script.status === "stopped" && nextAt >= 0 && (
          <div className="sql-console-script-actions">
            <span>Stopped before statement {nextAt + 1}.</span>
            <button type="button" className="btn btn-soft btn-sm d-flex align-items-center gap-1" disabled={running} onClick={() => resumeScript(entry, nextAt)}>
              <PlayFill size={12} /> Resume from statement {nextAt + 1}
            </button>
          </div>
        )}
      </div>
    );
  }

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
            title="Clear the screen (saved history is kept and comes back next time)"
            disabled={history.length === 0 || running}
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
            Type or paste SQL below and press Enter to run it against {app === "shadow" ? "shadow.db" : "backoffice.db"} (Shift+Enter adds a line). Paste several statements and they run one at a time, stopping at the first one that fails. Try one of the examples below to get started.
            {saved.length > 0 && ` Press ↑ to bring back your last ${saved.length} quer${saved.length === 1 ? "y" : "ies"} along with what they returned.`}
          </div>
        )}
        {history.map((entry) => entry.script ? renderScript(entry, entry.script) : (
          <div key={entry.id} className="sql-console-entry">
            <div className="sql-console-query-line">
              <span className="sql-console-prompt-char">db&gt;</span> {entry.query}
              {entry.restoredAt && (
                <span className="sql-console-restored-note">ran {formatRelative(entry.restoredAt)}</span>
              )}
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
            {entry.keptRows !== undefined && (
              <div className="sql-console-status">
                Only the first {entry.keptRows} rows of this result were saved — run it again for the rest.
              </div>
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
          <textarea
            ref={inputRef}
            className="sql-console-input"
            value={input}
            rows={1}
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
