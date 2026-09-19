import { useEffect, useRef, useState } from "react";
import { Terminal, PauseFill, PlayFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";

const POLL_MS = 4000;
const TAIL_LINES = 200;

export function LiveLogTail() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  async function fetchLog() {
    try {
      const text = await api.server.log(TAIL_LINES);
      setLines(text ? text.split("\n") : []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server log.");
    }
  }

  useEffect(() => {
    fetchLog();
    if (!live) return;
    const interval = setInterval(fetchLog, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="deploy-log-wrap">
      <div className="deploy-log-header">
        <div className="d-flex align-items-center gap-2">
          <Terminal size={13} />
          <span>server.log (BackEnd_V2)</span>
          {live && <span className="deploy-log-badge deploy-log-badge--running">Live</span>}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setLive((v) => !v)}
          aria-label={live ? "Pause log" : "Resume log"}
        >
          {live ? <PauseFill size={13} /> : <PlayFill size={13} />}
        </button>
      </div>
      <div className="deploy-log-body server-live-log-body" ref={bodyRef}>
        {error ? (
          <div className="deploy-log-line server-log-line--warn">{error}</div>
        ) : lines.length === 0 ? (
          <div className="deploy-log-line">No log output yet.</div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={`deploy-log-line${/warn|error/i.test(line) ? " server-log-line--warn" : ""}`}
            >
              {line || " "}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
