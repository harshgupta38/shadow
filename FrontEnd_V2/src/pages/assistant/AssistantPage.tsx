import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, Modal } from "react-bootstrap";
import { PlusLg, SendFill, Stars, ThreeDotsVertical, Trash3, XLg } from "react-bootstrap-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api, ChatMessageRead, ConversationRead } from "@/api";
import { ApiError } from "@/api/client";
import boySitting from "@/assets/boy_sitting.png";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import {
  ASSISTANT_AGENTS,
  type AssistantAgent,
} from "@/pages/assistant/AssistantPage.constants";

import "@/pages/assistant/AssistantPage.scss";

interface LocalSession {
  id: number;
  agent: AssistantAgent;
  messages: ChatMessageRead[];
  loadingMessages: boolean;
  hasLoadedMessages: boolean;
  isSending: boolean;
}

export function AssistantPage() {
  const toast = useToast();

  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocalSession | null>(null);
  const [draft, setDraft] = useState("");
  const [creatingAgentType, setCreatingAgentType] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  const hasSessions = sessions.length > 0;
  const selectedAgent = selectedSession?.agent ?? null;
  const SelectedIcon = selectedAgent?.icon;

  function resolveAgentFromConversation(conversation: ConversationRead): AssistantAgent {
    const normalizedTitle = (conversation.title ?? "").trim().toLowerCase();
    const directMatch = ASSISTANT_AGENTS.find((agent) => agent.label.toLowerCase() === normalizedTitle);
    if (directMatch) {
      return directMatch;
    }

    if (normalizedTitle.includes("goal")) {
      return ASSISTANT_AGENTS.find((agent) => agent.type === "goal_coach") ?? ASSISTANT_AGENTS[0];
    }
    if (normalizedTitle.includes("career")) {
      return ASSISTANT_AGENTS.find((agent) => agent.type === "career_advisor") ?? ASSISTANT_AGENTS[0];
    }
    if (normalizedTitle.includes("insight")) {
      return ASSISTANT_AGENTS.find((agent) => agent.type === "insights") ?? ASSISTANT_AGENTS[0];
    }

    return ASSISTANT_AGENTS.find((agent) => agent.type === "shadow") ?? ASSISTANT_AGENTS[0];
  }

  useEffect(() => {
    const initializeSessions = async () => {
      setLoadingSessions(true);
      try {
        const conversations = await api.chat.getConversations();
        const initialSessions: LocalSession[] = conversations.map((conversation) => ({
          id: conversation.id,
          agent: resolveAgentFromConversation(conversation),
          messages: [],
          loadingMessages: false,
          hasLoadedMessages: false,
          isSending: false,
        }));
        setSessions(initialSessions);
        setSelectedSessionId(null);
      } catch (error) {
        setSessions([]);
        setSelectedSessionId(null);
        toast.error(error instanceof ApiError ? error.message : "Could not load chat sessions.");
      } finally {
        setLoadingSessions(false);
      }
    };

    void initializeSessions();
  }, [toast]);

  function addMessagesToSession(sessionId: number, items: ChatMessageRead[]) {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      return {
        ...session,
        messages: [...session.messages, ...items],
      };
    }));
  }

  const loadMessages = useCallback(async (conversationId: number) => {
    setSessions((prev) => prev.map((session) => (
      session.id === conversationId ? { ...session, loadingMessages: true } : session
    )));

    try {
      const page = await api.chat.getMessages(conversationId, 50);
      setSessions((prev) => prev.map((session) => (
        session.id === conversationId
          ? { ...session, messages: page.items, loadingMessages: false, hasLoadedMessages: true }
          : session
      )));
    } catch (error) {
      setSessions((prev) => prev.map((session) => (
        session.id === conversationId ? { ...session, loadingMessages: false, hasLoadedMessages: true } : session
      )));
      toast.error(error instanceof ApiError ? error.message : "Could not load chat messages.");
    }
  }, [toast]);

  async function openAgent(agent: AssistantAgent) {
    const existing = sessions.find((s) => s.agent.type === agent.type);
    if (existing) {
      setSelectedSessionId(existing.id);
      setShowNewChatModal(false);
      if (!existing.hasLoadedMessages && !existing.loadingMessages) {
        void loadMessages(existing.id);
      }
      return;
    }

    setCreatingAgentType(agent.type);
    try {
      const conversation = await api.chat.createConversation({ title: agent.label });
      const session: LocalSession = {
        id: conversation.id,
        agent,
        messages: [],
        loadingMessages: false,
        hasLoadedMessages: false,
        isSending: false,
      };
      setSessions((prev) => [session, ...prev]);
      setSelectedSessionId(session.id);
      setShowNewChatModal(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not start a new conversation.");
    } finally {
      setCreatingAgentType(null);
    }
  }

  async function deleteSession(sessionId: number) {
    await api.chat.deleteConversation(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
    }
  }

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    if (!selectedSession.hasLoadedMessages && !selectedSession.loadingMessages) {
      void loadMessages(selectedSession.id);
    }
  }, [loadMessages, selectedSession]);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [selectedSession?.id, selectedSession?.messages.length]);

  async function sendMessage(rawContent?: string) {
    if (!selectedSession) {
      return;
    }

    const content = (rawContent ?? draft).trim();
    if (!content || selectedSession.isSending) {
      return;
    }

    const optimisticMessage: ChatMessageRead = {
      id: -Date.now(),
      conversation_id: selectedSession.id,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    addMessagesToSession(selectedSession.id, [optimisticMessage]);
    setSessions((prev) => prev.map((session) => (
      session.id === selectedSession.id ? { ...session, isSending: true } : session
    )));
    setDraft("");

    try {
      const response = await api.chat.sendMessage(selectedSession.id, { content });
      addMessagesToSession(selectedSession.id, [response.message]);
    } catch (error) {
      setSessions((prev) => prev.map((session) => {
        if (session.id !== selectedSession.id) {
          return session;
        }
        return {
          ...session,
          messages: session.messages.filter((message) => message.id !== optimisticMessage.id),
        };
      }));
      toast.error(error instanceof ApiError ? error.message : "Could not send your message.");
    } finally {
      setSessions((prev) => prev.map((session) => (
        session.id === selectedSession.id ? { ...session, isSending: false } : session
      )));
    }
  }

  const avatarStyle = (g: [string, string], size: number) => ({
    width: size, height: size, placeItems: "center",
    borderRadius: Math.round(size / 2.6), color: "#fff",
    background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
  });

  return (
    <div className="page-fill-height">
      <PageHeader title="Assistant" subtitle="Coaching that knows your goals, style and progress." />

      {loadingSessions && (
        <div className="surface d-flex align-items-center justify-content-center flex-grow-1">
          <div className="text-center">
            <div className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            <div className="small text-muted-2 mt-2">Loading sessions...</div>
          </div>
        </div>
      )}

      {!loadingSessions && !hasSessions && (
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

      {!loadingSessions && hasSessions && (
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
                    className={`chat-session-item w-100 border-0 ${selectedSessionId === session.id ? "active" : ""}`}
                    onClick={() => setSelectedSessionId(session.id)}
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
                      <Dropdown.Item onClick={() => setSelectedSessionId(null)}>
                        <span className="d-flex align-items-center"><XLg size={13} className="me-2" /> Close</span>
                      </Dropdown.Item>
                      <Dropdown.Item className="text-danger" onClick={() => setDeleteTarget(selectedSession)}>
                        <span className="d-flex align-items-center"><Trash3 size={13} className="me-2" /> Delete</span>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>

                <div className="chat-scroll" ref={chatScrollRef}>
                  {selectedSession.loadingMessages ? (
                    <div className="m-auto text-center">
                      <div className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <div className="small text-muted-2 mt-2">Loading conversation...</div>
                    </div>
                  ) : selectedSession.messages.length === 0 ? (
                    <div className="m-auto text-center" style={{ maxWidth: 440 }}>
                      <span className="d-inline-grid" style={avatarStyle(selectedAgent.gradient, 64)} aria-hidden="true">
                        <SelectedIcon size={30} />
                      </span>
                      <h3 className="h5 fw-bold mt-3">{selectedAgent.label}</h3>
                      <p className="text-muted-2">{selectedAgent.description}</p>
                      <div className="d-flex flex-column gap-2 mt-4">
                        {selectedAgent.suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable suggestion-chip"
                            onClick={() => { void sendMessage(suggestion); }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    selectedSession.messages.map((message) => (
                      <div key={`${message.id}-${message.created_at}`} className={`chat-bubble ${message.role === "user" ? "user" : "assistant"}`}>
                        {message.role === "user" ? (
                          message.content
                        ) : (
                          <div className="chat-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <form
                  className="chat-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage();
                  }}
                >
                  <textarea
                    className="form-control"
                    rows={1}
                    placeholder={`Message ${selectedAgent.label}...`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={selectedSession.isSending}
                  />
                  <button
                    type="submit"
                    className="btn btn-brand flex-shrink-0"
                    aria-label="Send message"
                    disabled={selectedSession.isSending || draft.trim().length === 0}
                  >
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
              const isCreating = creatingAgentType === agent.type;
              return (
                <button
                  key={agent.type}
                  type="button"
                  className="surface-2 p-3 border-0 text-start d-flex align-items-center gap-3 clickable hover-lift w-100"
                  onClick={() => { void openAgent(agent); }}
                  disabled={creatingAgentType !== null}
                >
                  <span className="d-inline-grid flex-shrink-0" style={avatarStyle(agent.gradient, 44)} aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0">
                    <div className="fw-bold">{agent.label}</div>
                    <div className="text-muted-2 small">{isCreating ? "Starting conversation..." : agent.description}</div>
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
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) {
            return;
          }
          void (async () => {
            try {
              await deleteSession(target.id);
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : "Could not delete this conversation.");
            }
          })();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
