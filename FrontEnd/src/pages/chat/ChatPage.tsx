import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, PlusLg, SendFill, Stars } from "react-bootstrap-icons";

import { api, ApiError, type AgentType, type ChatMessage, type ChatSession } from "@/api";
import { AgentAvatar } from "@/components/chat/AgentAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { AGENTS, agentMeta, CHAT_AGENTS } from "@/lib/agents";
import { relativeTime } from "@/lib/format";

function isAgentType(value: string | null): value is AgentType {
  return !!value && value in AGENTS;
}

export function ChatPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: sessions, loading, setData: setSessions } = useAsync(
    () => api.chat.sessions(),
    [],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [showPicker, setShowPicker] = useState(false);
  const autoStartRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSession = sessions?.find((s) => s.id === selectedId) ?? null;

  async function loadMessages(sessionId: number) {
    setLoadingMessages(true);
    try {
      setMessages(await api.chat.messages(sessionId));
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  function selectSession(session: ChatSession) {
    setSelectedId(session.id);
    setMobilePane("chat");
    void loadMessages(session.id);
  }

  async function startChat(agent: AgentType) {
    setShowPicker(false);
    try {
      const session = await api.chat.createSession({
        agent_type: agent,
        title: agentMeta(agent).label,
      });
      setSessions((prev) => [session, ...(prev ?? [])]);
      setSelectedId(session.id);
      setMessages([]);
      setMobilePane("chat");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the chat.");
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || !selectedId || sending) return;
    setInput("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: -Date.now(),
      session_id: selectedId,
      role: "user",
      content,
      agent_type: selectedSession?.agent_type ?? "general",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const response = await api.chat.send(selectedId, content);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        response.user_message,
        response.assistant_message,
      ]);
      setSessions((prev) =>
        (prev ?? [])
          .map((s) =>
            s.id === selectedId ? { ...s, updated_at: response.assistant_message.created_at } : s,
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      toast.error(err instanceof ApiError ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  // Auto-start a chat when arriving via ?agent=… from elsewhere.
  useEffect(() => {
    if (loading || autoStartRef.current) return;
    const agent = searchParams.get("agent");
    if (isAgentType(agent)) {
      autoStartRef.current = true;
      void startChat(agent);
      searchParams.delete("agent");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loadingMessages]);

  const meta = selectedSession ? agentMeta(selectedSession.agent_type) : null;

  return (
    <div className="page-fill-height">
      <PageHeader
        title="Assistant"
        subtitle="Coaching that knows your goals, style and progress."
        actions={
          <button className="btn btn-brand" onClick={() => setShowPicker(true)}>
            <PlusLg size={16} className="me-1" /> New chat
          </button>
        }
      />

      <div className="chat-layout">
        {/* Sessions */}
        <div
          className={`surface chat-sessions-panel flex-column ${
            mobilePane === "chat" ? "d-none d-md-flex" : "d-flex"
          }`}
        >
          <div className="p-2 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
            <button className="btn btn-soft w-100" onClick={() => setShowPicker(true)}>
              <PlusLg size={15} className="me-1" /> New chat
            </button>
          </div>
          <div className="chat-sessions flex-grow-1">
            {loading && <LoadingState label="Loading chats…" full={false} />}
            {!loading && (sessions?.length ?? 0) === 0 && (
              <div className="text-center text-muted-2 small p-3">
                No chats yet. Start one to get going.
              </div>
            )}
            {sessions?.map((session) => {
              const sMeta = agentMeta(session.agent_type);
              return (
                <button
                  type="button"
                  key={session.id}
                  className={`chat-session-item w-100 border-0 bg-transparent text-start ${
                    session.id === selectedId ? "active" : ""
                  }`}
                  onClick={() => selectSession(session)}
                >
                  <AgentAvatar agent={session.agent_type} size={38} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-semibold small text-truncate">{session.title}</div>
                    <div className="text-faint text-truncate" style={{ fontSize: "0.72rem" }}>
                      {sMeta.tagline} · {relativeTime(session.updated_at)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat window */}
        <div
          className={`surface chat-window ${
            mobilePane === "list" ? "d-none d-md-flex" : "d-flex"
          }`}
        >
          {!selectedSession ? (
            <div className="d-flex align-items-center justify-content-center h-100 p-4">
              <EmptyState
                icon={<Stars size={26} />}
                title="Pick an assistant"
                message="Start a new chat and choose the coach that fits what you need right now."
                action={
                  <button className="btn btn-brand" onClick={() => setShowPicker(true)}>
                    <PlusLg size={16} className="me-1" /> New chat
                  </button>
                }
              />
            </div>
          ) : (
            <>
              {/* Header */}
              <div
                className="d-flex align-items-center gap-2 p-3 border-bottom"
                style={{ borderColor: "var(--jv-border)" }}
              >
                <button
                  className="btn btn-ghost btn-icon d-md-none"
                  onClick={() => setMobilePane("list")}
                  aria-label="Back to chats"
                >
                  <ArrowLeft size={18} />
                </button>
                <AgentAvatar agent={selectedSession.agent_type} size={40} />
                <div className="min-w-0">
                  <div className="fw-bold text-truncate">{meta?.label}</div>
                  <div className="text-faint small text-truncate">{meta?.description}</div>
                </div>
              </div>

              {/* Messages */}
              <div className="chat-scroll" ref={scrollRef}>
                {loadingMessages ? (
                  <LoadingState label="Loading conversation…" full={false} />
                ) : messages.length === 0 ? (
                  <div className="m-auto text-center" style={{ maxWidth: 440 }}>
                    <AgentAvatar agent={selectedSession.agent_type} size={64} />
                    <h3 className="h5 fw-bold mt-3">{meta?.label}</h3>
                    <p className="text-muted-2">{meta?.description}</p>
                    {meta && meta.suggestions.length > 0 && (
                      <div className="d-flex flex-column gap-2 mt-4">
                        {meta.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable"
                            onClick={() => send(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-bubble ${message.role === "user" ? "user" : "assistant"}`}
                    >
                      {message.content}
                    </div>
                  ))
                )}
                {sending && (
                  <div className="chat-bubble assistant" aria-label="Assistant is typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                )}
              </div>

              {/* Composer */}
              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <textarea
                  className="form-control"
                  rows={1}
                  placeholder={`Message ${meta?.label}…`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-brand btn-icon flex-shrink-0"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                >
                  <SendFill size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Agent picker */}
      <Modal show={showPicker} onHide={() => setShowPicker(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Choose an assistant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column gap-2">
            {CHAT_AGENTS.map((agent) => (
              <button
                key={agent.type}
                type="button"
                className="surface-2 p-3 border-0 text-start d-flex align-items-center gap-3 clickable hover-lift"
                onClick={() => startChat(agent.type)}
              >
                <AgentAvatar agent={agent.type} size={44} />
                <div className="min-w-0">
                  <div className="fw-bold">{agent.label}</div>
                  <div className="text-muted-2 small">{agent.description}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
}
