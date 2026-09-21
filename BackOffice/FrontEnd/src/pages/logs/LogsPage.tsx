import { memo, useEffect, useRef, useState } from "react";
import { PauseFill, PlayFill, Terminal } from "react-bootstrap-icons";
import { api } from "@/api";
import { parseAnsiLine } from "@/lib/ansi";

// Keeps memory/DOM size bounded on a long-running session — a real
// terminal's scrollback is bounded too, this is just that same idea.
const MAX_LINES = 5000;

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

// Its own component (rather than inlining the parseAnsiLine().map(...) in
// LogsPage's render) so React.memo can skip re-parsing and re-rendering a
// line that hasn't changed — without this, every new incoming line makes
// `lines.map` produce a whole new element for every *previous* line too,
// re-running parseAnsiLine on the entire scrollback (up to MAX_LINES) on
// every single message.
const LogLine = memo(function LogLine({ line }: { line: string }) {
  return (
    <div className="logs-terminal-line">
      {parseAnsiLine(line).map((token, j) => (
        <span key={j} style={token.style}>{token.text}</span>
      ))}
    </div>
  );
});

// No PageHeader and no shared .app-content padding/max-width here — the
// terminal needs the full viewport, same reasoning as DatabasePage. See
// .app-content-full / .logs-page-full in theme.scss and the route-based
// switch in AppLayout.
export function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // Mirrors `playing` for the onclose handler below, which is set up once
  // per connect() call and would otherwise only ever see the value from
  // whichever render triggered that connection.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // ws.onclose fires asynchronously — by the time it runs after an unmount,
  // the component is already gone and nothing re-renders to flip playingRef
  // to false, so onclose would otherwise still see the last "true" it had
  // and reconnect into a socket nothing is left to ever close again.
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!playing) {
      disconnect();
      return;
    }
    connect();
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  function connect() {
    const ws = new WebSocket(api.server.logWsUrl(), api.server.logWsProtocols());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;
    };
    ws.onmessage = (event) => {
      setLines((prev) => {
        const next = [...prev, event.data as string];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // setPlaying's own value isn't visible here (this closure was built
      // at connect()-time) — reading the ref that useEffect keeps current
      // is what tells a real disconnect apart from our own disconnect()
      // tearing the socket down on pause/unmount.
      if (!unmountedRef.current && playingRef.current) scheduleReconnect();
    };
    ws.onerror = () => {
      setError("Lost connection to the log stream.");
    };
  }

  function scheduleReconnect() {
    const attempt = reconnectAttemptRef.current++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    reconnectTimerRef.current = window.setTimeout(connect, delay);
  }

  function disconnect() {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
    } else {
      setLines([]); // fresh seed on resume — matches the backend re-seeding its tail lines from scratch on a new connection
      setError(null);
      setPlaying(true);
    }
  }

  // Auto-scrolls to the newest line, but only while the user was already
  // at (or near) the bottom — scrolling up to read history shouldn't get
  // yanked back down by the next incoming line.
  useEffect(() => {
    const body = bodyRef.current;
    if (body && stickToBottomRef.current) {
      body.scrollTop = body.scrollHeight;
    }
  }, [lines]);

  function handleScroll() {
    const body = bodyRef.current;
    if (!body) return;
    stickToBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  }

  return (
    <div className="logs-page-full">
      <div className="logs-toolbar">
        <div className="logs-toolbar-title">
          <Terminal size={14} />
          <span>server.log · BackEnd_V2</span>
          {playing && (
            <span className={`deploy-log-badge deploy-log-badge--${connected ? "running" : "paused"}`}>
              {connected ? "Live" : "Reconnecting…"}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={togglePlay}
          aria-label={playing ? "Pause log" : "Play log"}
        >
          {playing ? <PauseFill size={14} /> : <PlayFill size={14} />}
        </button>
      </div>

      <div className="logs-terminal-body" ref={bodyRef} onScroll={handleScroll}>
        {!playing ? (
          <div className="logs-terminal-line logs-terminal-empty">
            Paused — click play to start streaming server.log.
          </div>
        ) : error && lines.length === 0 ? (
          <div className="logs-terminal-line logs-terminal-empty">{error}</div>
        ) : lines.length === 0 ? (
          <div className="logs-terminal-line logs-terminal-empty">Connecting…</div>
        ) : (
          lines.map((line, i) => <LogLine key={i} line={line} />)
        )}
      </div>
    </div>
  );
}
