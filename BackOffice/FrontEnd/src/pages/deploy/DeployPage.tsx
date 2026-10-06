import { useEffect, useRef, useState } from "react";
import { Dropdown, Modal } from "react-bootstrap";
import {
  CloudArrowUpFill,
  ArrowClockwise,
  ArrowCounterclockwise,
  ChevronLeft,
  ChevronRight,
  Terminal,
  ThreeDotsVertical,
  XLg,
  PlusLg,
} from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { api, ApiError } from "@/api";
import type { AppTarget, CommitInfo, Deployment, InstanceHealth } from "@/api";
import { formatDateTime, formatRelative, statusLabel, statusVariant } from "@/lib/format";
import { createRestartWatch, describeRestart, expiredMessage, isUnreachable, usableInstance, waitingMessage } from "@/lib/restartWatch";

const PAGE_SIZE = 5;
const COMMIT_LIMIT = 10;
const POLL_INTERVAL_MS = 1500;

// What every deployment record made before ref-tracking existed has
// stored as its git_ref — the real ref that was actually deployed was
// never captured for these, so "Redeploy" must not prefill this literal
// placeholder text as if it were a real, resubmittable ref.
const UNKNOWN_GIT_REF = "(current branch)";

// The branch whose commits the page lists until the person picks another.
const DEFAULT_BRANCH = "main";

// What a deploy dialog opens pre-filled with — used by "New Deployment"
// (nothing), "Redeploy" (a past deployment's own ref/label/description),
// and "Deploy" on a commit (just its SHA).
interface DeployPrefill {
  git_ref: string;
  label?: string;
  description?: string;
}

export function DeployPage({ app }: { app: AppTarget }) {
  const [branches, setBranches] = useState<string[]>([]);
  // Empty means "not resolved (yet)" — shown as a genuinely blank
  // selection, never a placeholder like "current branch", since the
  // person looking at this has no way to know what that actually is.
  // Once branches load it defaults to DEFAULT_BRANCH.
  const [selectedBranch, setSelectedBranch] = useState("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [commitsRefreshing, setCommitsRefreshing] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [confirmRollback, setConfirmRollback] = useState<Deployment | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [formRef, setFormRef] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [formDesc, setFormDesc] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activeJob, setActiveJob] = useState<Deployment | null>(null);
  const [revealedLines, setRevealedLines] = useState<string[]>([]);
  // Shown under the log while BackOffice is down mid-restart and the page waits for it to return.
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = Math.max(1, Math.ceil(deployments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDeployments = deployments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const jobRunning = activeJob !== null && activeJob.status === "running";

  // The label defaults to whatever ref you're deploying — but only until
  // you actually type (or a prefill sets) your own label; after that,
  // editing the ref doesn't overwrite it anymore.
  function handleRefChange(value: string) {
    setFormRef(value);
    if (!labelTouched) setFormLabel(value);
  }

  function handleLabelChange(value: string) {
    setFormLabel(value);
    setLabelTouched(true);
  }

  // Opens the New Deployment dialog — blank for a fresh deployment, or
  // pre-filled for "Redeploy" (reuses a past deployment's ref/label/
  // description/target) and "Deploy" on a specific commit (just its SHA).
  function openDeployModal(prefill?: DeployPrefill) {
    setFormRef(prefill?.git_ref ?? "");
    setFormLabel(prefill?.label ?? "");
    setLabelTouched(Boolean(prefill?.label));
    setFormDesc(prefill?.description ?? "");
    setFormError(null);
    setShowModal(true);
  }

  async function loadAll() {
    setLoading(true);
    const [branchesResult, deploysResult] = await Promise.allSettled([
      api.deploy.branches(app),
      api.deploy.history(app, 1, 50),
    ]);
    if (branchesResult.status === "fulfilled") {
      setBranches(branchesResult.value.branches);
      // Only fills in the selection if nothing's been picked yet — never
      // overwrites a branch the person already chose (this can re-run
      // after a job finishes). Defaults to the main branch, since the
      // checked-out one is often a detached HEAD (after deploying a
      // commit SHA) and would leave the commit list empty; falls back to
      // the checked-out branch, then blank, if main doesn't exist.
      const { branches: available, current } = branchesResult.value;
      const defaultBranch = available.includes(DEFAULT_BRANCH) ? DEFAULT_BRANCH : current;
      setSelectedBranch((prev) => prev || defaultBranch || "");
    }
    if (deploysResult.status === "fulfilled") setDeployments(deploysResult.value);
    setLoadError(
      branchesResult.status === "rejected" && deploysResult.status === "rejected"
        ? "Could not reach the BackOffice API."
        : null,
    );
    setLoading(false);
  }

  async function loadCommits() {
    // No branch resolved (yet, or HEAD is detached) — nothing to query,
    // and the table's own empty state already reads fine as "blank".
    if (!selectedBranch) {
      setCommits([]);
      return;
    }
    try {
      setCommits(await api.deploy.commits(app, COMMIT_LIMIT, selectedBranch));
    } catch {
      // The section just shows "no commit history available" — the
      // top-level loadError already covers a fully unreachable API.
    }
  }

  // Pulls in commits (and branches) pushed since the page loaded. Listing a branch's commits already
  // runs `git fetch origin` on the host first, so re-running it is what makes new ones appear.
  async function refreshCommits() {
    setCommitsRefreshing(true);
    try {
      const result = await api.deploy.branches(app).catch(() => null);
      if (result) setBranches(result.branches); // the selection is left exactly as it is
      await loadCommits();
    } finally {
      setCommitsRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (revealRef.current) clearInterval(revealRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  useEffect(() => {
    loadCommits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

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
    setWaitNote(null);

    // Deploying BackOffice restarts the very process that tracks the job, so it can't report its
    // own result. For it the page watches from outside instead: it remembers which process it
    // started on, treats failed requests as "restarting", and gives the new process a fixed
    // window to answer before assuming the restart failed. (A Shadow deploy leaves BackOffice up.)
    const watchesSelf = app === "backoffice";
    const watch = createRestartWatch();
    let before: InstanceHealth | null = null;
    if (watchesSelf) api.system.health().then((h) => { before = usableInstance(h); }).catch(() => undefined);

    pollRef.current = setInterval(async () => {
      try {
        const record = await api.deploy.detail(app, id);
        const cameBack = watch.succeeded();
        setWaitNote(null);
        setActiveJob(record);
        if (record.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          let output = record.log_output || "(no output)";
          if (cameBack) {
            const after = await api.system.health().then(usableInstance).catch(() => null);
            output += `\n\n${describeRestart(before, after)}`;
          }
          revealLog(output);
          loadAll();
          loadCommits(); // a deploy/rollback may have moved HEAD
        }
      } catch (err) {
        // Transient hiccup — keep polling. For BackOffice itself, an unreachable API is the restart.
        if (!watchesSelf || !isUnreachable(err)) return;
        if (watch.failed() === "expired") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setWaitNote(null);
          setActiveJob((prev) => (prev ? { ...prev, status: "failed" } : prev));
          setRevealedLines((prev) => [...prev, "", expiredMessage()]);
          return;
        }
        setWaitNote(waitingMessage(watch.secondsDown()));
      }
    }, POLL_INTERVAL_MS);
  }

  // Viewing a past deployment's saved log — instantly, no typewriter
  // reveal, since that effect is for watching something happen live, not
  // for browsing history. Stops any poll for whatever was active before,
  // since that job would otherwise keep updating the panel underneath it.
  function handleShowLogs(d: Deployment) {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (revealRef.current) {
      clearInterval(revealRef.current);
      revealRef.current = null;
    }
    setWaitNote(null);
    setActiveJob(d);
    if (d.status === "running") {
      setRevealedLines([]);
      pollJob(d.id);
    } else {
      setRevealedLines((d.log_output || "(no output)").split("\n"));
    }
  }

  async function handleConfirmRollback() {
    if (!confirmRollback?.commit_sha) return;
    const target = confirmRollback;
    setConfirmRollback(null);
    try {
      const record = await api.deploy.rollback(app, {
        commit_sha: target.commit_sha!,
        description: `Rollback to deployment #${target.id} (${target.label})`,
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
      const record = await api.deploy.trigger(app, {
        git_ref: formRef.trim(),
        label: formLabel.trim(),
        description: formDesc.trim(),
      });
      setShowModal(false);
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
        subtitle={app === "shadow" ? "Manage and trigger deployments for Shadow V2." : "Manage and trigger deployments for BackOffice itself."}
        actions={[{
          key: "new-deployment",
          label: "New Deployment",
          icon: <PlusLg size={15} />,
          onClick: () => openDeployModal(),
          disabled: jobRunning,
        }]}
      />

      {loadError && (
        <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
          {loadError}
        </div>
      )}

      {/* Log panel — a live run, or a past deployment's log opened via "Show logs" */}
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
            {waitNote && <div className="deploy-log-line">{waitNote}</div>}
            {jobRunning && <span className="deploy-log-cursor" />}
          </div>
        </div>
      )}

      {/* Deployment log — actions actually taken through BackOffice */}
      <div className="mb-4">
        <h2 className="dp-section-title">Deployment Log</h2>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Date</th>
                <th>Triggered By</th>
                <th>Status</th>
                <th className="dp-table-th-actions" />
              </tr>
            </thead>
            <tbody>
              {pageDeployments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--jv-faint)", padding: "1.5rem" }}>
                    {loading ? "Loading…" : "No deployments logged yet."}
                  </td>
                </tr>
              ) : (
                pageDeployments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="dp-tag" title={d.description || undefined}>{d.label}</span>
                    </td>
                    <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatRelative(d.started_at)}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{d.triggered_by}</td>
                    <td>
                      <span className={`dp-status-dot dp-status-dot--${statusVariant(d.status)}`}>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                    <td className="dp-table-td-actions">
                      <Dropdown align="end">
                        <Dropdown.Toggle
                          as="button"
                          className="btn-action btn-action--icon"
                          id={`deploy-actions-${d.id}`}
                          disabled={jobRunning}
                        >
                          <ThreeDotsVertical size={14} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu popperConfig={{ strategy: "fixed" }}>
                          <Dropdown.Item
                            className="d-flex align-items-center gap-2"
                            disabled={!d.commit_sha}
                            onClick={() => setConfirmRollback(d)}
                          >
                            <ArrowCounterclockwise size={14} /> Rollback
                          </Dropdown.Item>
                          <Dropdown.Item
                            className="d-flex align-items-center gap-2"
                            onClick={() => openDeployModal({
                              // Deployments logged before ref-tracking existed
                              // stored this literal placeholder — there's no
                              // real ref to redeploy, so leave it blank rather
                              // than resubmitting a string that was never a
                              // real branch/tag/SHA in the first place.
                              git_ref: d.git_ref === UNKNOWN_GIT_REF ? "" : d.git_ref,
                              label: d.label,
                              description: d.description,
                            })}
                          >
                            <CloudArrowUpFill size={14} /> Redeploy
                          </Dropdown.Item>
                          <Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => handleShowLogs(d)}>
                            <Terminal size={14} /> Show logs
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
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

      {/* Recent commits — browse any branch, deploy any commit on it */}
      <div>
        <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
          <h2 className="dp-section-title mb-0">Recent Commits</h2>
          {/* stretch, not center: the button takes whatever height the dropdown renders at */}
          <div className="d-flex align-items-stretch gap-2">
            <select
              className="form-control form-control-sm"
              style={{ width: 240 }}
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              {/* Genuinely blank, not a "current branch" placeholder — shown only
                  when selectedBranch is "" (HEAD detached, or still loading). */}
              <option value="" />
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-soft btn-sm d-flex align-items-center justify-content-center"
              onClick={() => void refreshCommits()}
              disabled={commitsRefreshing}
              title="Fetch the latest commits and branches from origin"
              aria-label="Refresh commits"
            >
              {commitsRefreshing ? <span className="spinner-border spinner-border-sm" /> : <ArrowClockwise size={14} />}
            </button>
          </div>
        </div>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Commit</th>
                <th>Message</th>
                <th>Author</th>
                <th>Date</th>
                <th className="dp-table-th-actions" />
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
                  <tr key={c.sha}>
                    <td>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="dp-tag">{c.short_sha}</span>
                        {c.is_current && <span className="dp-current-badge">Current</span>}
                      </div>
                    </td>
                    <td className="deploy-desc">{c.message}</td>
                    <td style={{ color: "var(--jv-muted)" }}>{c.author}</td>
                    <td style={{ color: "var(--jv-muted)", whiteSpace: "nowrap" }}>{formatDateTime(c.date)}</td>
                    <td className="dp-table-td-actions">
                      <button
                        type="button"
                        className="btn-action btn-action--ghost"
                        disabled={jobRunning}
                        onClick={() => openDeployModal({ git_ref: c.sha })}
                      >
                        <CloudArrowUpFill size={13} />
                        Deploy
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / Redeploy Modal */}
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
              <label className="form-label">Branch, tag, or commit SHA</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. main, v1.2.3, or a4f9c2e"
                value={formRef}
                onChange={(e) => handleRefChange(e.target.value)}
                required
                autoFocus
              />
              <div className="form-text">
                A branch is fetched and pulled to its latest commit before deploying; a tag or
                commit SHA is checked out exactly as given.
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Label</label>
              <input
                type="text"
                className="form-control"
                placeholder="Defaults to the ref above"
                value={formLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
              />
              <div className="form-text">
                Just for your own record-keeping — doesn't affect what's actually deployed.
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

      {/* Rollback confirmation */}
      {confirmRollback && (
        <Modal show onHide={() => setConfirmRollback(null)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Roll back to this deployment?</h5>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setConfirmRollback(null)}
              aria-label="Close"
            >
              <XLg size={14} />
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              This checks out <strong>{confirmRollback.commit_sha?.slice(0, 7)}</strong> — from{" "}
              "<strong>{confirmRollback.label}</strong>" — directly in a detached HEAD state and
              restarts the server. No pull: the next regular deploy moves the branch back to its
              tip, so this is for emergency recovery, not a permanent revert.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmRollback(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirmRollback}>
              Yes, rollback
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
