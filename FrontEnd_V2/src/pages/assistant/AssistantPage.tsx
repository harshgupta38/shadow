import { useState } from "react";
import { Dropdown, Modal } from "react-bootstrap";
import { PlusLg, SendFill, Stars, ThreeDotsVertical, Trash3, XLg } from "react-bootstrap-icons";

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
    const existing = sessions.find((s) => s.agent.type === agent.type);
    if (existing) { setSelectedSession(existing); setShowNewChatModal(false); return; }
    const session: LocalSession = { id: Date.now(), agent };
    setSessions((prev) => [session, ...prev]);
    setSelectedSession(session);
    setShowNewChatModal(false);
  }

  function deleteSession(sessionId: number) {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (selectedSession?.id === sessionId) setSelectedSession(null);
  }

  const avatarStyle = (g: [string, string], size: number) => ({
    width: size, height: size, placeItems: "center",
    borderRadius: Math.round(size / 2.6), color: "#fff",
    background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
  });

  return (
    <div className="page-fill-height">
      <PageHeader title="Assistant" subtitle="Coaching that knows your goals, style and progress." />

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
                        <div className="assistant-list-dot-fill" style={{ background: `linear-gradient(135deg, ${agent.gradient[0]}, ${agent.gradient[1]})` }} />
                        <Icon size={16} />
                      </div>
                      {!isLast && <div className="assistant-list-connector" />}
                    </div>
                    <button type="button" className="assistant-list-item" onClick={() => openAgent(agent)}>
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
          <img src={boySitting} alt="" className="assistant-bg-illustration" aria-hidden="true" />
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
                    <span className="d-inline-grid flex-shrink-0" style={avatarStyle(session.agent.gradient, 38)} aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <div className="flex-grow-1 min-w-0 text-start">
                      <div className="fw-semibold small text-truncate chat-session-title">{session.agent.label}</div>
                      <div className="text-faint text-truncate chat-session-meta" style={{ fontSize: "0.72rem" }}>
                        {session.agent.tagline} · just now
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="surface chat-window d-flex">
            {!selectedSession ? (
              <div className="d-flex align-items-center justify-content-center h-100 p-4 w-100">
                <div className="text-center" style={{ maxWidth: 440 }}>
                  <div className="mx-auto mb-3 d-inline-grid" style={{ width: 64, height: 64, placeItems: "center", borderRadius: 18, background: "var(--jv-brand-soft)", color: "var(--jv-brand-1)" }}>
                    <Stars size={28} />
                  </div>
                  <h3 className="h5 fw-bold mt-2">Pick an assistant</h3>
                  <p className="text-muted-2">Start a new chat and choose the coach that fits what you need right now.</p>
                  <button className="btn btn-brand mt-1" onClick={() => setShowNewChatModal(true)}>
                    <PlusLg size={16} className="me-1" /> New session
                  </button>
                </div>
              </div>
            ) : selectedAgent && SelectedIcon ? (
              <>
                <div className="d-flex align-items-center gap-2 p-3 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
                  <span className="d-inline-grid flex-shrink-0" style={avatarStyle(selectedAgent.gradient, 40)} aria-hidden="true">
                    <SelectedIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="fw-bold text-truncate">{selectedAgent.label}</div>
                    <div className="text-faint small text-truncate">{selectedAgent.tagline} · {selectedAgent.description}</div>
                  </div>
                  <Dropdown align="end" className="ms-auto flex-shrink-0">
                    <Dropdown.Toggle as="button" className="btn btn-ghost btn-icon border-0" aria-label="Session options" bsPrefix=" ">
                      <ThreeDotsVertical size={16} />
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={() => setSelectedSession(null)}>
                        <span className="d-flex align-items-center"><XLg size={13} className="me-2" /> Close</span>
                      </Dropdown.Item>
                      <Dropdown.Item className="text-danger" onClick={() => setDeleteTarget(selectedSession)}>
                        <span className="d-flex align-items-center"><Trash3 size={13} className="me-2" /> Delete</span>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>

                <div className="chat-scroll">
                  <div className="m-auto text-center" style={{ maxWidth: 440 }}>
                    <span className="d-inline-grid" style={avatarStyle(selectedAgent.gradient, 64)} aria-hidden="true">
                      <SelectedIcon size={30} />
                    </span>
                    <h3 className="h5 fw-bold mt-3">{selectedAgent.label}</h3>
                    <p className="text-muted-2">{selectedAgent.description}</p>
                    <div className="d-flex flex-column gap-2 mt-4">
                      {selectedAgent.suggestions.map((s) => (
                        <button key={s} type="button" className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable suggestion-chip">{s}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <form className="chat-composer" onSubmit={(e) => e.preventDefault()}>
                  <textarea className="form-control" rows={1} placeholder={`Message ${selectedAgent.label}…`} />
                  <button type="submit" className="btn btn-brand flex-shrink-0" aria-label="Send message">
                    <SendFill size={16} />
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      )}

      <Modal show={showNewChatModal} onHide={() => setShowNewChatModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Choose an assistant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column gap-2">
            {ASSISTANT_AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <button key={agent.type} type="button" className="surface-2 p-3 border-0 text-start d-flex align-items-center gap-3 clickable hover-lift w-100" onClick={() => openAgent(agent)}>
                  <span className="d-inline-grid flex-shrink-0" style={avatarStyle(agent.gradient, 44)} aria-hidden="true">
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
        onConfirm={() => { if (deleteTarget) deleteSession(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
