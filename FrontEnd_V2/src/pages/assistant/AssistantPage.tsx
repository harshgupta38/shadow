import { useState } from "react";
import { Modal } from "react-bootstrap";
import { PlusLg, SendFill, Trash3 } from "react-bootstrap-icons";

import boySitting from "@/assets/boy_sitting.png";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ASSISTANT_AGENTS, type AssistantAgent } from "@/pages/assistant/AssistantPage.constants";

import "@/pages/assistant/AssistantPage.scss";

interface LocalSession {
  id: number;
  agent: AssistantAgent;
}

export function AssistantPage() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<LocalSession | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocalSession | null>(null);

  const hasSessions = sessions.length > 0;
  const selectedAgent = selectedSession?.agent ?? null;
  const SelectedIcon = selectedAgent?.icon;

  function openAgent(agent: AssistantAgent) {
    const session: LocalSession = { id: Date.now(), agent };
    setSessions((prev) => [session, ...prev]);
    setSelectedSession(session);
    setShowNewChatModal(false);
  }

  function deleteSession(sessionId: number) {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (selectedSession?.id === sessionId) {
        setSelectedSession(remaining[0] ?? null);
      }
      return remaining;
    });
  }

  return (
    <div className="page-fill-height">
      <PageHeader
        title="Assistant"
        subtitle="Coaching that knows your goals, style and progress."
      />

      {!hasSessions && (
        <div className="assistant-picker">
          <div className="assistant-picker-inner">
            <div className="assistant-list">
              {ASSISTANT_AGENTS.map((agent, index) => {
                const Icon = agent.icon;
                const isLast = index === ASSISTANT_AGENTS.length - 1;
                return (
                  <div className="assistant-list-item-wrapper" key={agent.type}>
                    <div className="assistant-list-track">
                      <div className="assistant-list-dot">
                        <div
                          className="assistant-list-dot-fill"
                          style={{
                            background: `linear-gradient(135deg, ${agent.gradient[0]}, ${agent.gradient[1]})`,
                          }}
                        />
                        <Icon size={16} />
                      </div>
                      {!isLast && <div className="assistant-list-connector" />}
                    </div>
                    <button
                      type="button"
                      className="assistant-list-item"
                      onClick={() => openAgent(agent)}
                    >
                      <div className="assistant-list-content">
                        <div className="assistant-list-label">{agent.label}</div>
                        <span className="assistant-agent-cta-text">{agent.description}</span>
                        <div className="assistant-agent-cta">
                          <span className="assistant-agent-cta-link">Start chat &rarr;</span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <img
            src={boySitting}
            alt=""
            className="assistant-bg-illustration"
            aria-hidden="true"
          />
        </div>
      )}

      {hasSessions && (
        <div className="chat-layout">
          <div className="surface chat-sessions-panel d-flex flex-column">
            <div className="p-2 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
              <button className="btn btn-soft w-100" onClick={() => setShowNewChatModal(true)}>
                <PlusLg size={15} className="me-1" /> New session
              </button>
            </div>
            <div className="chat-sessions flex-grow-1">
              {sessions.map((session) => {
                const Icon = session.agent.icon;
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={`chat-session-item w-100 border-0 ${selectedSession?.id === session.id ? "active" : ""}`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <span
                      className="d-inline-grid flex-shrink-0"
                      style={{
                        width: 38,
                        height: 38,
                        placeItems: "center",
                        borderRadius: Math.round(38 / 2.6),
                        color: "#fff",
                        background: `linear-gradient(135deg, ${session.agent.gradient[0]}, ${session.agent.gradient[1]})`,
                      }}
                      aria-hidden="true"
                    >
                      <Icon size={19} />
                    </span>
                    <div className="flex-grow-1 min-w-0 text-start">
                      <div className="fw-semibold small text-truncate chat-session-title">
                        {session.agent.label}
                      </div>
                      <div
                        className="text-faint text-truncate chat-session-meta"
                        style={{ fontSize: "0.72rem" }}
                      >
                        {session.agent.tagline} · just now
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="surface chat-window d-flex">
            {SelectedIcon && selectedAgent && (
              <>
                <div
                  className="d-flex align-items-center gap-2 p-3 border-bottom"
                  style={{ borderColor: "var(--jv-border)" }}
                >
                  {/* Chat - window header */}
                  <span
                    className="d-inline-grid flex-shrink-0"
                    style={{
                      width: 40,
                      height: 40,
                      placeItems: "center",
                      borderRadius: Math.round(40 / 2.6),
                      color: "#fff",
                      background: `linear-gradient(135deg, ${selectedAgent.gradient[0]}, ${selectedAgent.gradient[1]})`,
                    }}
                    aria-hidden="true"
                  >
                    <SelectedIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="fw-bold text-truncate">{selectedAgent.label}</div>
                    <div className="text-faint small text-truncate">
                      {selectedAgent.tagline} · {selectedAgent.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost text-danger ms-auto"
                    aria-label="Close conversation"
                    onClick={() => setDeleteTarget(selectedSession)}
                  >
                    <Trash3 size={14} />
                  </button>
                </div>

                <div className="chat-scroll">
                  <div className="m-auto text-center" style={{ maxWidth: 440 }}>
                    <span
                      className="d-inline-grid"
                      style={{
                        width: 64,
                        height: 64,
                        placeItems: "center",
                        borderRadius: Math.round(64 / 2.6),
                        color: "#fff",
                        background: `linear-gradient(135deg, ${selectedAgent.gradient[0]}, ${selectedAgent.gradient[1]})`,
                      }}
                      aria-hidden="true"
                    >
                      <SelectedIcon size={30} />
                    </span>
                    <h3 className="h5 fw-bold mt-3">{selectedAgent.label}</h3>
                    <p className="text-muted-2">{selectedAgent.description}</p>
                    <div className="d-flex flex-column gap-2 mt-4">
                      {selectedAgent.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable suggestion-chip"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <form className="chat-composer" onSubmit={(e) => e.preventDefault()}>
                  <textarea
                    className="form-control"
                    rows={1}
                    placeholder={`Message ${selectedAgent.label}…`}
                  />
                  <button
                    type="submit"
                    className="btn btn-brand flex-shrink-0"
                    aria-label="Send message"
                  >
                    <SendFill size={16} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* New chat modal — only reachable when sessions already exist */}
      <Modal show={showNewChatModal} onHide={() => setShowNewChatModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Choose an assistant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column gap-2">
            {ASSISTANT_AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <button
                  key={agent.type}
                  type="button"
                  className="surface-2 p-3 border-0 text-start d-flex align-items-center gap-3 clickable hover-lift w-100"
                  onClick={() => openAgent(agent)}
                >
                  <span
                    className="d-inline-grid flex-shrink-0"
                    style={{
                      width: 44,
                      height: 44,
                      placeItems: "center",
                      borderRadius: Math.round(44 / 2.6),
                      color: "#fff",
                      background: `linear-gradient(135deg, ${agent.gradient[0]}, ${agent.gradient[1]})`,
                    }}
                    aria-hidden="true"
                  >
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0">
                    <div className="fw-bold">{agent.label}</div>
                    <div className="text-muted-2 small">{agent.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>

      <ConfirmDialog
        show={deleteTarget !== null}
        title="Delete conversation?"
        message="This will remove this chat from your history. Any tasks, goals, or metrics already created from it will stay in your app."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteSession(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
