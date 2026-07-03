import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, PlusLg, SendFill, Stars, Trash3 } from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type AgentType,
  type AssistantProposedAction,
  type ChatMessage,
  type ChatSession,
} from "@/api";
import { AgentAvatar } from "@/components/chat/AgentAvatar";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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

type ActionStatus = "idle" | "running" | "executed" | "failed" | "rejected";

interface ProposedActionState {
  action: AssistantProposedAction;
  status: ActionStatus;
  message: string | null;
  link: string | null;
}

interface ActionConfirmState {
  sessionId: number;
  assistantMessageId: number;
  actionId: string;
}

const LEGACY_GOAL_CONTEXT_MARKER = "\n\n[goal_context]";

function parseGoalCoachGoalId(params: URLSearchParams): number | null {
  const goalIdRaw = params.get("goalId");
  if (!goalIdRaw) return null;

  const goalId = Number(goalIdRaw);
  if (!Number.isFinite(goalId) || goalId <= 0) return null;

  return goalId;
}

function stripGoalContext(content: string): string {
  const markerIndex = content.indexOf(LEGACY_GOAL_CONTEXT_MARKER);
  if (markerIndex < 0) return content;
  return content.slice(0, markerIndex).trimEnd();
}

function moduleLabel(module: AssistantProposedAction["module"]): string {
  switch (module) {
    case "plan":
      return "Plan";
    case "goals":
      return "Goals";
    case "track":
      return "Track";
    default:
      return "Action";
  }
}

export function ChatPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: sessions,
    loading,
    setData: setSessions,
    reload: reloadSessions,
  } = useAsync(
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
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [messageActions, setMessageActions] = useState<Record<number, ProposedActionState[]>>({});
  const [actionConfirm, setActionConfirm] = useState<ActionConfirmState | null>(null);
  const autoStartRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSession = sessions?.find((s) => s.id === selectedId) ?? null;

  function updateActionState(
    assistantMessageId: number,
    actionId: string,
    updater: (state: ProposedActionState) => ProposedActionState,
  ) {
    setMessageActions((prev) => {
      const entries = prev[assistantMessageId];
      if (!entries) return prev;
      return {
        ...prev,
        [assistantMessageId]: entries.map((entry) =>
          entry.action.id === actionId ? updater(entry) : entry,
        ),
      };
    });
  }

  function setProposalStates(assistantMessageId: number, actions: AssistantProposedAction[]) {
    if (actions.length === 0) return;
    setMessageActions((prev) => ({
      ...prev,
      [assistantMessageId]: actions.map((action) => ({
        action,
        status: "idle",
        message: null,
        link: null,
      })),
    }));
  }

  async function executeProposal(
    sessionId: number,
    assistantMessageId: number,
    action: AssistantProposedAction,
    confirmed: boolean,
  ) {
    updateActionState(assistantMessageId, action.id, (state) => ({
      ...state,
      status: "running",
      message: null,
    }));

    try {
      const result = await api.chat.executeAction(sessionId, action, confirmed);
      updateActionState(assistantMessageId, action.id, (state) => ({
        ...state,
        status: result.status,
        message: result.message,
        link: result.link ?? null,
      }));

      if (result.status === "failed") {
        toast.error(result.message);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't execute this action.";
      updateActionState(assistantMessageId, action.id, (state) => ({
        ...state,
        status: "failed",
        message,
      }));
      toast.error(message);
    }
  }

  async function autoExecuteProposals(
    sessionId: number,
    assistantMessageId: number,
    actions: AssistantProposedAction[],
  ) {
    const autoActions = actions.filter(
      (action) => action.confidence === "high" && !action.requires_confirmation && !action.destructive,
    );
    for (const action of autoActions) {
      await executeProposal(sessionId, assistantMessageId, action, false);
    }
  }

  async function loadMessages(sessionId: number) {
    setLoadingMessages(true);
    try {
      const loaded = await api.chat.messages(sessionId);
      setMessages(
        loaded.map((message) =>
          message.role === "user" ? { ...message, content: stripGoalContext(message.content) } : message,
        ),
      );
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

  async function startChat(agent: AgentType, goalId: number | null = null) {
    setShowPicker(false);
    try {
      const session = await api.chat.createSession({
        agent_type: agent,
        title: agentMeta(agent).label,
        goal_id: agent === "goal_coach" && goalId ? goalId : undefined,
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
    const sessionId = selectedId;
    if (!content || !sessionId || sending) return;

    setInput("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: -Date.now(),
      session_id: sessionId,
      role: "user",
      content,
      agent_type: selectedSession?.agent_type ?? "general",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const response = await api.chat.send(sessionId, content);
      const renderedUserMessage = {
        ...response.user_message,
        content: stripGoalContext(response.user_message.content),
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        renderedUserMessage,
        response.assistant_message,
      ]);
      setSessions((prev) =>
        (prev ?? [])
          .map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  updated_at: response.assistant_message.created_at,
                  title: response.session.title,
                }
              : s,
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );

      const assistantMessageId = response.assistant_message.id;
      setProposalStates(assistantMessageId, response.proposed_actions);
      void autoExecuteProposals(sessionId, assistantMessageId, response.proposed_actions);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      toast.error(err instanceof ApiError ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  async function confirmDeleteConversation() {
    if (!deleteTarget || deleting) return;
    const deletingId = deleteTarget.id;
    const deletingSelected = selectedId === deletingId;

    setDeleting(true);
    setSessions((prev) => (prev ?? []).filter((session) => session.id !== deletingId));
    if (deletingSelected) {
      setSelectedId(null);
      setMessages([]);
      setMessageActions({});
      setMobilePane("list");
    }

    try {
      await api.chat.deleteSession(deletingId);
      toast.success("Conversation deleted.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the conversation.");
      reloadSessions();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // Auto-start a chat when arriving via ?agent=… from elsewhere.
  useEffect(() => {
    if (loading || autoStartRef.current) return;
    const agent = searchParams.get("agent");
    const goalId = parseGoalCoachGoalId(searchParams);
    if (isAgentType(agent)) {
      autoStartRef.current = true;
      void startChat(agent, agent === "goal_coach" ? goalId : null);
      searchParams.delete("agent");
      searchParams.delete("goalId");
      searchParams.delete("goalTitle");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loadingMessages]);

  const meta = selectedSession ? agentMeta(selectedSession.agent_type) : null;
  const confirmEntry = actionConfirm
    ? messageActions[actionConfirm.assistantMessageId]?.find(
        (entry) => entry.action.id === actionConfirm.actionId,
      ) ?? null
    : null;
  const confirmBusy = confirmEntry?.status === "running";

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
                <button
                  type="button"
                  className="btn btn-ghost text-danger ms-auto"
                  aria-label="Delete conversation"
                  onClick={() => selectedSession && setDeleteTarget(selectedSession)}
                >
                  <Trash3 size={14} className="me-2" />
                </button>
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
                      {message.role === "assistant" ? (
                        <>
                          <MarkdownMessage content={message.content} />
                          {(messageActions[message.id] ?? []).length > 0 && (
                            <div className="chat-action-list">
                              {(messageActions[message.id] ?? []).map((entry) => (
                                <div key={entry.action.id} className="chat-action-card">
                                  <div className="d-flex align-items-center justify-content-between gap-2">
                                    <span className="chat-action-module">
                                      {moduleLabel(entry.action.module)}
                                    </span>
                                    <span className={`chat-action-confidence ${entry.action.confidence}`}>
                                      {entry.action.confidence}
                                    </span>
                                  </div>
                                  <div className="fw-semibold small mt-2">{entry.action.title}</div>
                                  {!!entry.action.rationale && (
                                    <div className="text-faint small mt-1">{entry.action.rationale}</div>
                                  )}
                                  <div className="chat-action-meta mt-2">
                                    {entry.status === "idle" ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={() => {
                                          if (!selectedSession) return;
                                          if (entry.action.requires_confirmation) {
                                            setActionConfirm({
                                              sessionId: selectedSession.id,
                                              assistantMessageId: message.id,
                                              actionId: entry.action.id,
                                            });
                                            return;
                                          }
                                          void executeProposal(
                                            selectedSession.id,
                                            message.id,
                                            entry.action,
                                            false,
                                          );
                                        }}
                                      >
                                        {entry.action.requires_confirmation
                                          ? "Confirm and run"
                                          : "Run now"}
                                      </button>
                                    ) : entry.status === "running" ? (
                                      <span className="small text-faint">Running action…</span>
                                    ) : (
                                      <span
                                        className={`small ${
                                          entry.status === "executed" ? "text-success" : "text-danger"
                                        }`}
                                      >
                                        {entry.message}
                                      </span>
                                    )}
                                    {entry.link && entry.status === "executed" && (
                                      <Link to={entry.link} className="small fw-semibold">
                                        Open module
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        message.content
                      )}
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

      <ConfirmDialog
        show={deleteTarget !== null}
        title="Delete conversation?"
        message="This will remove this chat from your history. Any tasks, goals, or metrics already created from it will stay in your app."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={() => {
          void confirmDeleteConversation();
        }}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        show={actionConfirm !== null}
        title={confirmEntry ? `Run action: ${confirmEntry.action.title}?` : "Run action?"}
        message={
          confirmEntry?.action.rationale ||
          "This action may create or update data in your account."
        }
        confirmLabel="Run action"
        destructive={confirmEntry?.action.destructive ?? false}
        busy={confirmBusy}
        onConfirm={() => {
          if (!actionConfirm || !confirmEntry) return;
          void (async () => {
            await executeProposal(
              actionConfirm.sessionId,
              actionConfirm.assistantMessageId,
              confirmEntry.action,
              true,
            );
            setActionConfirm(null);
          })();
        }}
        onCancel={() => {
          if (!confirmBusy) setActionConfirm(null);
        }}
      />
    </div>
  );
}
