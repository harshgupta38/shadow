import { Fragment, useState, useEffect, useRef } from "react";
import { Modal } from "react-bootstrap";
import {
  CloudArrowUpFill,
  ArrowCounterclockwise,
  ChevronLeft,
  ChevronRight,
  Terminal,
  XLg,
  PlusLg,
} from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";

interface Deployment {
  id: number;
  tag: string;
  description: string;
  target: "Frontend" | "Backend" | "Both";
  date: string;
  duration: string;
  status: "success" | "warn";
  isCurrent: boolean;
}

const ALL_DEPLOYMENTS: Deployment[] = [
  { id: 1,  tag: "v2.4.1", description: "Hotfix: auth token refresh",  target: "Both",     date: "18 Sep 2026", duration: "142s", status: "success", isCurrent: true  },
  { id: 2,  tag: "v2.4.0", description: "Profile page redesign",        target: "Frontend", date: "15 Sep 2026", duration: "98s",  status: "success", isCurrent: false },
  { id: 3,  tag: "v2.3.9", description: "API rate limiting",            target: "Both",     date: "10 Sep 2026", duration: "155s", status: "success", isCurrent: false },
  { id: 4,  tag: "v2.3.8", description: "DB index optimisation",        target: "Backend",  date: "04 Sep 2026", duration: "61s",  status: "success", isCurrent: false },
  { id: 5,  tag: "v2.3.7", description: "Habit tracker beta",           target: "Both",     date: "28 Aug 2026", duration: "133s", status: "warn",    isCurrent: false },
  { id: 6,  tag: "v2.3.6", description: "Email verification",           target: "Both",     date: "20 Aug 2026", duration: "118s", status: "success", isCurrent: false },
  { id: 7,  tag: "v2.3.5", description: "Password reset flow",          target: "Frontend", date: "14 Aug 2026", duration: "89s",  status: "success", isCurrent: false },
  { id: 8,  tag: "v2.3.4", description: "Push notifications",           target: "Backend",  date: "06 Aug 2026", duration: "75s",  status: "success", isCurrent: false },
  { id: 9,  tag: "v2.3.3", description: "Dark mode improvements",       target: "Frontend", date: "30 Jul 2026", duration: "93s",  status: "success", isCurrent: false },
  { id: 10, tag: "v2.3.2", description: "Analytics integration",        target: "Both",     date: "22 Jul 2026", duration: "161s", status: "warn",    isCurrent: false },
  { id: 11, tag: "v2.3.1", description: "Onboarding flow",              target: "Frontend", date: "14 Jul 2026", duration: "82s",  status: "success", isCurrent: false },
  { id: 12, tag: "v2.3.0", description: "Initial V2 launch",            target: "Both",     date: "01 Jul 2026", duration: "198s", status: "success", isCurrent: false },
];

const PAGE_SIZE = 5;

function buildLogLines(tag: string, target: string, type: "deploy" | "rollback"): string[] {
  const lines: string[] = [
    `$ shadow-cli ${type} --tag ${tag} --target ${target.toLowerCase()}`,
    "",
    `[deploy] Task: ${type} · tag ${tag} · target: ${target}`,
    `[deploy] Connecting to deploy server…`,
    `[deploy] Authenticated ✓`,
    `[deploy] Resolving tag ${tag} in registry…`,
    `[deploy] Tag ${tag} found ✓`,
  ];

  if (target !== "Backend") {
    lines.push(
      "[deploy] Building frontend…",
      "[deploy] → vite build — 2508 modules transformed",
      "[deploy] → Bundle: 325 kB  (gzip: 107 kB)",
      "[deploy] Uploading frontend assets…",
      "[deploy] Frontend deployed ✓",
    );
  }
  if (target !== "Frontend") {
    lines.push(
      "[deploy] Pulling backend image…",
      "[deploy] Running database migrations…",
      "[deploy] → 0 pending migrations",
      "[deploy] Starting backend container…",
      "[deploy] Health check → GET /health → 200 OK ✓",
    );
  }

  lines.push(
    "",
    `[deploy] ✓ ${type === "rollback" ? "Rollback" : "Deployment"} complete  (${Math.floor(Math.random() * 60 + 80)}s)`,
  );

  return lines;
}

interface ActiveJob {
  type: "deploy" | "rollback";
  tag: string;
  target: string;
}

export function DeployPage() {
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [formTag, setFormTag] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTarget, setFormTarget] = useState<"Frontend" | "Backend" | "Both">("Both");
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [jobDone, setJobDone] = useState(false);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = Math.ceil(ALL_DEPLOYMENTS.length / PAGE_SIZE);
  const pageData = ALL_DEPLOYMENTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logLines]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function startJob(job: ActiveJob) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const lines = buildLogLines(job.tag, job.target, job.type);
    setActiveJob(job);
    setLogLines([]);
    setJobDone(false);
    setConfirmId(null);

    let i = 0;
    intervalRef.current = setInterval(() => {
      setLogLines((prev) => [...prev, lines[i]]);
      i++;
      if (i >= lines.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setJobDone(true);
      }
    }, 120);
  }

  function handleRollback(d: Deployment) {
    startJob({ type: "rollback", tag: d.tag, target: d.target });
  }

  function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    setTimeout(() => {
      const tag = formTag.trim() || "v2.4.2";
      const target = formTarget;
      setShowModal(false);
      setFormSubmitting(false);
      setFormTag("");
      setFormDesc("");
      setFormTarget("Both");
      startJob({ type: "deploy", tag, target });
    }, 400);
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        icon={<CloudArrowUpFill size={20} />}
        title="Deployments"
        subtitle="Manage and trigger deployments for Shadow V2."
        actions={[{
          key: "new-deployment",
          label: "New Deployment",
          icon: <PlusLg size={15} />,
          onClick: () => setShowModal(true),
        }]}
      />

      {/* Log panel */}
      {activeJob && (
        <div className="deploy-log-wrap">
          <div className="deploy-log-header">
            <div className="d-flex align-items-center gap-2">
              <Terminal size={13} />
              <span>
                {activeJob.type === "rollback"
                  ? `Rolling back to ${activeJob.tag}`
                  : `Deploying ${activeJob.tag}`}
              </span>
              {jobDone
                ? <span className="deploy-log-badge deploy-log-badge--ok">Done</span>
                : <span className="deploy-log-badge deploy-log-badge--running">Running</span>}
            </div>
            {jobDone && (
              <button className="btn btn-ghost btn-icon" onClick={() => setActiveJob(null)}>
                <XLg size={13} />
              </button>
            )}
          </div>
          <div className="deploy-log-body" ref={logBodyRef}>
            {logLines.map((line, i) => (
              <div key={i} className="deploy-log-line">{line || " "}</div>
            ))}
            {!jobDone && <span className="deploy-log-cursor" />}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="dp-table-wrap">
        <table className="dp-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Description</th>
              <th>Target</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="dp-tag">{d.tag}</span>
                      {d.isCurrent && <span className="dp-current-badge">Current</span>}
                    </div>
                  </td>
                  <td className="deploy-desc">{d.description}</td>
                  <td>
                    <span className={`deploy-target-pill deploy-target-pill--${d.target.toLowerCase()}`}>
                      {d.target}
                    </span>
                  </td>
                  <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{d.date}</td>
                  <td style={{ color: "var(--jv-muted)" }}>{d.duration}</td>
                  <td>
                    <span className={`dp-status-dot dp-status-dot--${d.status}`}>
                      {d.status === "success" ? "Success" : "Partial"}
                    </span>
                  </td>
                  <td>
                    {d.isCurrent ? (
                      <span style={{ color: "var(--jv-faint)", fontSize: "0.8rem" }}>—</span>
                    ) : (
                      <button
                        className="btn-action btn-action--ghost"
                        onClick={() => setConfirmId(confirmId === d.id ? null : d.id)}
                      >
                        <ArrowCounterclockwise size={13} />
                        Rollback
                      </button>
                    )}
                  </td>
                </tr>
                {confirmId === d.id && (
                  <tr className="dp-confirm-row">
                    <td colSpan={7}>
                      <div className="dp-confirm-inner">
                        <span>Rollback to <strong>{d.tag}</strong>?</span>
                        <button className="btn-action btn-action--danger" onClick={() => handleRollback(d)}>
                          Yes, rollback
                        </button>
                        <button className="btn-action btn-action--ghost" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="deploy-pagination">
          <button
            className="btn btn-ghost btn-icon"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`deploy-page-btn${p === page ? " deploy-page-btn--active" : ""}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-icon"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* New Deployment Modal */}
      <Modal
        show={showModal}
        onHide={() => !formSubmitting && setShowModal(false)}
        centered
        className="deploy-modal"
      >
        <Modal.Header>
          <h5 className="deploy-modal-title">New Deployment</h5>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setShowModal(false)}
            disabled={formSubmitting}
            aria-label="Close"
          >
            <XLg size={14} />
          </button>
        </Modal.Header>
        <form onSubmit={handleModalSubmit}>
          <Modal.Body>
            <div className="mb-3">
              <label className="form-label">Git Tag</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. v2.4.2"
                value={formTag}
                onChange={(e) => setFormTag(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="mb-3">
              <label className="form-label">
                Description{" "}
                <span style={{ color: "var(--jv-faint)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                className="form-control"
                placeholder="Brief description of this deployment"
                rows={2}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                style={{ resize: "none" }}
              />
            </div>
            <div>
              <label className="form-label">Deploy Target</label>
              <div className="deploy-target-group">
                {(["Frontend", "Backend", "Both"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`deploy-target-opt${formTarget === t ? " deploy-target-opt--active" : ""}`}
                    onClick={() => setFormTarget(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowModal(false)}
              disabled={formSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-brand d-flex align-items-center gap-2"
              disabled={formSubmitting}
            >
              {formSubmitting && <span className="spinner-border spinner-border-sm" />}
              {formSubmitting ? "Starting…" : "Deploy"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  );
}
