import { Fragment, useEffect, useRef, useState } from "react";
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
import { api, ApiError } from "@/api";
import type { CommitInfo, Deployment, DeployTarget } from "@/api";
import { formatDateTime, formatRelative, statusLabel, statusVariant } from "@/lib/format";

const PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 1500;

export function DeployPage() {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [confirmSha, setConfirmSha] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [formLabel, setFormLabel] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTarget, setFormTarget] = useState<DeployTarget>("Backend");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activeJob, setActiveJob] = useState<Deployment | null>(null);
  const [revealedLines, setRevealedLines] = useState<string[]>([]);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = Math.max(1, Math.ceil(deployments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDeployments = deployments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const jobRunning = activeJob !== null && activeJob.status === "running";

  async function loadAll() {
    setLoading(true);
    const [commitsResult, deploysResult] = await Promise.allSettled([
      api.deploy.commits(20),
      api.deploy.history(1, 50),
    ]);
    if (commitsResult.status === "fulfilled") setCommits(commitsResult.value);
    if (deploysResult.status === "fulfilled") setDeployments(deploysResult.value);
    setLoadError(
      commitsResult.status === "rejected" && deploysResult.status === "rejected"
        ? "Could not reach the BackOffice API."
        : null,
    );
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (revealRef.current) clearInterval(revealRef.current);
    };
  }, []);

  useEffect(() => {
    if (logBodyRef.current) logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [revealedLines]);

  function revealLog(text: string) {
    if (revealRef.current) clearInterval(revealRef.current);
    const lines = text.split("\n");
    setRevealedLines([]);
    let i = 0;
    revealRef.current = setInterval(() => {
      setRevealedLines((prev) => [...prev, lines[i]]);
      i++;
      if (i >= lines.length) {
        clearInterval(revealRef.current!);
        revealRef.current = null;
      }
    }, 90);
  }

  function pollJob(id: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const record = await api.deploy.detail(id);
        setActiveJob(record);
        if (record.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          revealLog(record.log_output || "(no output)");
          loadAll(); // refresh history + commits (a rollback/deploy may have moved HEAD)
        }
      } catch {
        // transient network hiccup — keep polling, the interval will retry
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleRollback(commit: CommitInfo) {
    setConfirmSha(null);
    try {
      const record = await api.deploy.rollback({
        commit_sha: commit.sha,
        description: `Rollback to ${commit.short_sha} — ${commit.message}`,
      });
      setActiveJob(record);
      setRevealedLines([]);
      pollJob(record.id);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not start the rollback.");
    }
  }

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      const record = await api.deploy.trigger({
        label: formLabel.trim(),
        description: formDesc.trim(),
        target: formTarget,
      });
      setShowModal(false);
      setFormLabel("");
      setFormDesc("");
      setFormTarget("Backend");
      setActiveJob(record);
      setRevealedLines([]);
      pollJob(record.id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not start the deployment.");
    } finally {
      setFormSubmitting(false);
    }
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
          disabled: jobRunning,
        }]}
      />

      {loadError && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
          {loadError}
        </div>
      )}

      {/* Log panel */}
      {activeJob && (
        <div className="deploy-log-wrap">
          <div className="deploy-log-header">
            <div className="d-flex align-items-center gap-2">
              <Terminal size={13} />
              <span>
                {activeJob.kind === "rollback" ? `Rolling back to ${activeJob.git_ref.slice(0, 7)}` : `Deploying ${activeJob.label}`}
              </span>
              {jobRunning
                ? <span className="deploy-log-badge deploy-log-badge--running">Running</span>
                : <span className={`deploy-log-badge deploy-log-badge--${activeJob.status === "success" ? "ok" : "running"}`}>
                    {statusLabel(activeJob.status)}
                  </span>}
            </div>
            {!jobRunning && (
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setActiveJob(null)}>
                <XLg size={13} />
              </button>
            )}
          </div>
          <div className="deploy-log-body" ref={logBodyRef}>
            {jobRunning && revealedLines.length === 0 ? (
              <div className="deploy-log-line">Waiting for the deploy to complete…</div>
            ) : (
              revealedLines.map((line, i) => (
                <div key={i} className="deploy-log-line">{line || " "}</div>
              ))
            )}
            {jobRunning && <span className="deploy-log-cursor" />}
          </div>
        </div>
      )}

      {/* Recent commits — rollback targets */}
      <div className="mb-4">
        <h2 className="dp-section-title">Recent Commits</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Commit</th>
                <th>Message</th>
                <th>Author</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commits.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    {loading ? "Loading…" : "No commit history available."}
                  </td>
                </tr>
              ) : (
                commits.map((c) => (
                  <Fragment key={c.sha}>
                    <tr>
                      <td>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="dp-tag">{c.short_sha}</span>
                          {c.is_current && <span className="dp-current-badge">Current</span>}
                        </div>
                      </td>
                      <td className="deploy-desc">{c.message}</td>
                      <td style={{ color: "var(--jv-muted)" }}>{c.author}</td>
                      <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatDateTime(c.date)}</td>
                      <td>
                        {c.is_current ? (
                          <span style={{ color: "var(--jv-faint)", fontSize: "0.8rem" }}>—</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-action btn-action--ghost"
                            disabled={jobRunning}
                            onClick={() => setConfirmSha(confirmSha === c.sha ? null : c.sha)}
                          >
                            <ArrowCounterclockwise size={13} />
                            Rollback
                          </button>
                        )}
                      </td>
                    </tr>
                    {confirmSha === c.sha && (
                      <tr className="dp-confirm-row">
                        <td colSpan={5}>
                          <div className="dp-confirm-inner">
                            <span>Roll back to <strong>{c.short_sha}</strong> — {c.message}?</span>
                            <button type="button" className="btn-action btn-action--danger" onClick={() => handleRollback(c)}>
                              Yes, rollback
                            </button>
                            <button type="button" className="btn-action btn-action--ghost" onClick={() => setConfirmSha(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deployment log — actions actually taken through BackOffice */}
      <div>
        <h2 className="dp-section-title">Deployment Log</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Target</th>
                <th>Kind</th>
                <th>Date</th>
                <th>Triggered By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageDeployments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    {loading ? "Loading…" : "No deployments logged yet."}
                  </td>
                </tr>
              ) : (
                pageDeployments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="dp-tag" title={d.description || undefined}>{d.label}</span>
                    </td>
                    <td>
                      <span className={`deploy-target-pill deploy-target-pill--${d.target.toLowerCase()}`}>
                        {d.target}
                      </span>
                    </td>
                    <td style={{ color: "var(--jv-muted)", textTransform: "capitalize" }}>{d.kind}</td>
                    <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatRelative(d.started_at)}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{d.triggered_by}</td>
                    <td>
                      <span className={`dp-status-dot dp-status-dot--${statusVariant(d.status)}`}>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="deploy-pagination">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`page-number-btn${p === safePage ? " page-number-btn--active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={safePage === totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

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
            type="button"
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
            {formError && (
              <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
                {formError}
              </div>
            )}
            <div className="mb-3">
              <label className="form-label">Label</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Hotfix — auth token refresh"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                required
                autoFocus
              />
              <div className="form-text">
                There are no git tags in this repo — this deploys the latest commit on the
                tracked branch. The label is just for your own record-keeping.
              </div>
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
              {formTarget !== "Backend" && (
                <div className="form-text">
                  Only the backend is redeployed automatically. Frontend changes are deployed
                  separately (Firebase Hosting) and aren't triggered from here.
                </div>
              )}
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
