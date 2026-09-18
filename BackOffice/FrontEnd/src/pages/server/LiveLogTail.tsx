import { useEffect, useRef, useState } from "react";
import { Terminal, PauseFill, PlayFill } from "react-bootstrap-icons";

const SAMPLE_LINES = [
  'INFO: 10.0.0.4:51322 - "GET /api/goals HTTP/1.1" 200 OK',
  'INFO: 10.0.0.7:44210 - "POST /api/plan-records HTTP/1.1" 201 Created',
  'INFO: 10.0.0.4:51340 - "GET /api/dashboard HTTP/1.1" 200 OK',
  "INFO: worker-3 handled request in 84ms",
  'INFO: 10.0.0.9:38810 - "GET /api/habits HTTP/1.1" 200 OK',
  'INFO: 10.0.0.4:51322 - "POST /api/chat/messages HTTP/1.1" 200 OK',
  "WARNING: Slow query detected (612ms) on plan_records",
  'INFO: 10.0.0.11:60021 - "GET /api/reports/latest HTTP/1.1" 200 OK',
  "INFO: worker-1 handled request in 41ms",
  'INFO: 10.0.0.7:44210 - "GET /api/notifications HTTP/1.1" 200 OK',
  'INFO: 10.0.0.13:51229 - "PATCH /api/tasks/12 HTTP/1.1" 200 OK',
  "INFO: worker-4 handled request in 63ms",
];

function randomLine(): string {
  const ip = `10.0.0.${Math.floor(Math.random() * 20) + 2}`;
  const base = SAMPLE_LINES[Math.floor(Math.random() * SAMPLE_LINES.length)];
  return base.replace(/10\.0\.0\.\d+/, ip);
}

export function LiveLogTail() {
  const [lines, setLines] = useState<string[]>(() => Array.from({ length: 6 }, randomLine));
  const [live, setLive] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      setLines((prev) => [...prev.slice(-49), randomLine()]);
    }, 2200);
    return () => clearInterval(interval);
  }, [live]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="deploy-log-wrap">
      <div className="deploy-log-header">
        <div className="d-flex align-items-center gap-2">
          <Terminal size={13} />
          <span>uvicorn · stdout</span>
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
        {lines.map((line, i) => (
          <div
            key={i}
            className={`deploy-log-line${line.startsWith("WARNING") ? " server-log-line--warn" : ""}`}
          >
            {line}
          </div>
        ))}
        {live && <span className="deploy-log-cursor" />}
      </div>
    </div>
  );
}
