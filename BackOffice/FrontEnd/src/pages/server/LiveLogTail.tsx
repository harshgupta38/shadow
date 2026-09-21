import { useEffect, useRef, useState } from "react";
import { Terminal, PauseFill, PlayFill } from "react-bootstrap-icons";
import { api } from "@/api";

// Caps how many lines this keeps in memory/DOM — a log left open for a
// long watch session shouldn't grow the page's memory unbounded.
const MAX_LINES = 500;

export function LiveLogTail() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Off by default — no connection to BackEnd_V2 at all, not even a
  // first request, until the person explicitly clicks play. Watching
  // this is now something an admin opts into, not something every page
  // load quietly costs the live server.
  const [live, setLive] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!live) return;

    const es = new EventSource(api.server.logStreamUrl(), { withCredentials: true });
    es.onopen = () => setError(null);
    es.onmessage = (e) => {
      setLines((prev) => [...prev, e.data].slice(-MAX_LINES));
    };
    es.onerror = () => {
      // EventSource auto-reconnects on its own (also relied on by the
      // existing notifications stream) — this only distinguishes "still
      // trying" from a connection that's given up.
      setError(es.readyState === EventSource.CONNECTING ? "Reconnecting…" : "Lost connection to the log stream.");
    };

    return () => es.close();
  }, [live]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  function handleToggle() {
    if (live) {
      setLive(false);
    } else {
      setLines([]);
      setError(null);
      setLive(true);
    }
  }

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
          onClick={handleToggle}
          aria-label={live ? "Stop watching the log" : "Watch the log live"}
        >
          {live ? <PauseFill size={13} /> : <PlayFill size={13} />}
        </button>
      </div>
      <div className="deploy-log-body server-live-log-body" ref={bodyRef}>
        {error && <div className="deploy-log-line server-log-line--warn">{error}</div>}
        {!live ? (
          <div className="deploy-log-line">Click play to start watching the live log.</div>
        ) : lines.length === 0 && !error ? (
          <div className="deploy-log-line">Connecting…</div>
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
