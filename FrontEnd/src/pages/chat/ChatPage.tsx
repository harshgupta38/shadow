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
const MAX_COMPOSER_LINES = 5;
const CHAT_ACTIONS_STORAGE_KEY = "shadow.chat.messageActions.v1";
const GOAL_DISCOVERY_SESSION_STORAGE_KEY = "shadow.chat.goalDiscoverySessionId.v1";
const GOAL_DISCOVERY_QUERY_PARAM = "goalDiscovery";
const GOAL_DISCOVERY_SEED_PREFIX = "[goal_discovery_seed]";
const GOAL_DISCOVERY_STARTER_PROMPT =
  `${GOAL_DISCOVERY_SEED_PREFIX} Ask me one clear question to understand what I want to achieve and by when. ` +
  "After I answer, help me turn it into trackable goals and propose actions with title, description, category, and target date.";

type StoredActionStateMap = Record<number, ProposedActionState[]>;
type StoredActionStateStore = Record<string, Record<string, ProposedActionState[]>>;

function readStoredActionStateStore(): StoredActionStateStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHAT_ACTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredActionStateStore;
  } catch {
    return {};
  }
}

function writeStoredActionStateStore(store: StoredActionStateStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAT_ACTIONS_STORAGE_KEY, JSON.stringify(store));
}

function loadStoredSessionActionStates(sessionId: number): StoredActionStateMap {
  const sessionState = readStoredActionStateStore()[String(sessionId)] ?? {};
  const loaded: StoredActionStateMap = {};

  for (const [rawMessageId, entries] of Object.entries(sessionState)) {
    const messageId = Number(rawMessageId);
    if (!Number.isFinite(messageId) || !Array.isArray(entries) || entries.length === 0) continue;
    loaded[messageId] = entries;
  }

  return loaded;
}

function persistStoredSessionActionStates(sessionId: number, states: StoredActionStateMap): void {
  const store = readStoredActionStateStore();
  if (Object.keys(states).length === 0) {
    delete store[String(sessionId)];
    writeStoredActionStateStore(store);
    return;
  }

  const normalized: Record<string, ProposedActionState[]> = {};
  for (const [messageId, entries] of Object.entries(states)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    normalized[String(messageId)] = entries;
  }

  if (Object.keys(normalized).length === 0) {
    delete store[String(sessionId)];
  } else {
    store[String(sessionId)] = normalized;
  }

  writeStoredActionStateStore(store);
}

function clearStoredSessionActionStates(sessionId: number): void {
  const store = readStoredActionStateStore();
  if (!(String(sessionId) in store)) return;
  delete store[String(sessionId)];
  writeStoredActionStateStore(store);
}

function readStoredGoalDiscoverySessionId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GOAL_DISCOVERY_SESSION_STORAGE_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    window.localStorage.removeItem(GOAL_DISCOVERY_SESSION_STORAGE_KEY);
    return null;
  }
  return parsed;
}

function writeStoredGoalDiscoverySessionId(sessionId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GOAL_DISCOVERY_SESSION_STORAGE_KEY, String(sessionId));
}

function clearStoredGoalDiscoverySessionId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GOAL_DISCOVERY_SESSION_STORAGE_KEY);
}

function isGoalDiscoverySeedMessage(content: string): boolean {
  return content.trimStart().startsWith(GOAL_DISCOVERY_SEED_PREFIX);
}

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

function actionBadgeLabel(action: AssistantProposedAction): string {
  if (action.type === "goals.add_milestone") return "Milestone";
  if (action.type === "goals.create_goal") return "Goal";
  if (action.type === "plan.create_task") return "Task";
  if (action.type === "repetitive_tasks.create_task") return "Habit";
  if (action.module === "track") return "Metric";
  return "Action";
}

function actionDisplayTitle(action: AssistantProposedAction): string {
  if (action.type === "repetitive_tasks.create_task") {
    const stripped = action.title.replace(/^add\s+repetitive\s+task\s*:\s*/i, "").trim();
    return stripped || action.title;
  }
  if (action.type !== "goals.add_milestone") return action.title;

  const stripped = action.title.replace(/^add\s+milestone\s*:\s*/i, "").trim();
  return stripped || action.title;
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
  const [collapsedActionMessages, setCollapsedActionMessages] = useState<Record<number, boolean>>({});
  const [actionConfirm, setActionConfirm] = useState<ActionConfirmState | null>(null);
  const autoStartRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const selectedSession = sessions?.find((s) => s.id === selectedId) ?? null;

  function autoResizeComposer() {
    const composer = composerInputRef.current;
    if (!composer) return;

    composer.style.height = "auto";

    const styles = window.getComputedStyle(composer);
    const lineHeight = Number.parseFloat(styles.lineHeight || "") || 20;
    const paddingTop = Number.parseFloat(styles.paddingTop || "") || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "") || 0;
    const borderTop = Number.parseFloat(styles.borderTopWidth || "") || 0;
    const borderBottom = Number.parseFloat(styles.borderBottomWidth || "") || 0;

    const maxHeight =
      lineHeight * MAX_COMPOSER_LINES + paddingTop + paddingBottom + borderTop + borderBottom;
    const nextHeight = Math.min(composer.scrollHeight, maxHeight);

    composer.style.height = `${Math.ceil(nextHeight)}px`;
    composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function prefillComposer(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const composer = composerInputRef.current;
      if (!composer) return;
      composer.focus();
      const end = text.length;
      composer.setSelectionRange(end, end);
    });
  }

  function updateActionState(
    sessionId: number,
    assistantMessageId: number,
    actionId: string,
    updater: (state: ProposedActionState) => ProposedActionState,
  ) {
    setMessageActions((prev) => {
      const entries = prev[assistantMessageId];
      if (!entries) return prev;
      const next = {
        ...prev,
        [assistantMessageId]: entries.map((entry) =>
          entry.action.id === actionId ? updater(entry) : entry,
        ),
      };
      persistStoredSessionActionStates(sessionId, next);
      return next;
    });
  }

  function setProposalStates(
    sessionId: number,
    assistantMessageId: number,
    actions: AssistantProposedAction[],
  ) {
    if (actions.length === 0) return;
    setMessageActions((prev) => {
      const next = {
        ...prev,
        [assistantMessageId]: actions.map((action) => ({
          action,
          status: "idle" as const,
          message: null,
          link: null,
        })),
      };
      persistStoredSessionActionStates(sessionId, next);
      return next;
    });
    setCollapsedActionMessages((prev) => ({
      ...prev,
      [assistantMessageId]: false,
    }));
  }

  function toggleActionVisibility(assistantMessageId: number) {
    setCollapsedActionMessages((prev) => ({
      ...prev,
      [assistantMessageId]: !(prev[assistantMessageId] ?? false),
    }));
  }

  async function saveAllProposals(sessionId: number, assistantMessageId: number) {
    const entries = messageActions[assistantMessageId] ?? [];
    const pending = entries.filter(
      (entry) =>
        entry.status === "idle" && !entry.action.requires_confirmation && !entry.action.destructive,
    );

    for (const entry of pending) {
      await executeProposal(sessionId, assistantMessageId, entry.action, false);
    }
  }

  async function executeProposal(
    sessionId: number,
    assistantMessageId: number,
    action: AssistantProposedAction,
    confirmed: boolean,
  ) {
    updateActionState(sessionId, assistantMessageId, action.id, (state) => ({
      ...state,
      status: "running",
      message: null,
    }));

    try {
      const result = await api.chat.executeAction(sessionId, action, confirmed);
      updateActionState(sessionId, assistantMessageId, action.id, (state) => ({
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
      updateActionState(sessionId, assistantMessageId, action.id, (state) => ({
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
      (action) =>
        action.confidence === "high" &&
        !action.requires_confirmation &&
        !action.destructive &&
        action.type !== "goals.add_milestone" &&
        action.type !== "goals.create_goal",
    );
    for (const action of autoActions) {
      await executeProposal(sessionId, assistantMessageId, action, false);
    }
  }

  async function sendGoalDiscoveryKickoff(sessionId: number) {
    writeStoredGoalDiscoverySessionId(sessionId);
    setSending(true);
    try {
      const response = await api.chat.send(sessionId, GOAL_DISCOVERY_STARTER_PROMPT, {
        freshIntakeMode: true,
      });
      setMessages((prev) => [...prev, response.assistant_message]);
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
      setProposalStates(sessionId, assistantMessageId, response.proposed_actions);
      void autoExecuteProposals(sessionId, assistantMessageId, response.proposed_actions);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start goal discovery.");
    } finally {
      setSending(false);
    }
  }

  async function loadMessages(sessionId: number) {
    setLoadingMessages(true);
    try {
      const loaded = await api.chat.messages(sessionId);
      const rendered = loaded
        .map((message) =>
          message.role === "user" ? { ...message, content: stripGoalContext(message.content) } : message,
        )
        .filter(
          (message) =>
            message.role !== "user" ||
            !isGoalDiscoverySeedMessage(message.content),
        );
      setMessages(rendered);

      const persisted = loadStoredSessionActionStates(sessionId);
      const assistantIds = new Set(
        rendered.filter((message) => message.role === "assistant").map((message) => message.id),
      );

      const hydrated: StoredActionStateMap = {};
      for (const [messageId, entries] of Object.entries(persisted)) {
        const numericMessageId = Number(messageId);
        if (!assistantIds.has(numericMessageId) || !Array.isArray(entries) || entries.length === 0) {
          continue;
        }
        hydrated[numericMessageId] = entries;
      }

      setMessageActions(hydrated);
      setCollapsedActionMessages(
        Object.fromEntries(Object.keys(hydrated).map((messageId) => [Number(messageId), true])) as Record<
          number,
          boolean
        >,
      );
      persistStoredSessionActionStates(sessionId, hydrated);
    } catch {
      setMessages([]);
      setMessageActions({});
      setCollapsedActionMessages({});
    } finally {
      setLoadingMessages(false);
    }
  }

  function selectSession(session: ChatSession) {
    setMobilePane("chat");
    if (selectedId === session.id) return;
    setSelectedId(session.id);
    setMessageActions({});
    setCollapsedActionMessages({});
    void loadMessages(session.id);
  }

  function findExistingGoalCoachSession(goalId: number): ChatSession | null {
    const matches = (sessions ?? []).filter(
      (session) => session.agent_type === "goal_coach" && session.goal_id === goalId,
    );
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }

  function findExistingGoalDiscoverySession(): ChatSession | null {
    const sessionId = readStoredGoalDiscoverySessionId();
    if (sessionId === null) return null;

    const existing = (sessions ?? []).find(
      (session) => session.id === sessionId && session.agent_type === "general",
    );
    if (existing) return existing;

    clearStoredGoalDiscoverySessionId();
    return null;
  }

  async function startChat(agent: AgentType, goalId: number | null = null): Promise<ChatSession | null> {
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
      setMessageActions({});
      setCollapsedActionMessages({});
      setMobilePane("chat");
      return session;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the chat.");
      return null;
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
      setProposalStates(sessionId, assistantMessageId, response.proposed_actions);
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
      setCollapsedActionMessages({});
      setMobilePane("list");
    }

    try {
      await api.chat.deleteSession(deletingId);
      clearStoredSessionActionStates(deletingId);
      if (readStoredGoalDiscoverySessionId() === deletingId) {
        clearStoredGoalDiscoverySessionId();
      }
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
    const goalDiscoveryRequested = searchParams.get(GOAL_DISCOVERY_QUERY_PARAM) === "1";
    if (isAgentType(agent)) {
      autoStartRef.current = true;
      if (agent === "goal_coach" && goalId) {
        const existing = findExistingGoalCoachSession(goalId);
        if (existing) {
          selectSession(existing);
        } else {
          void startChat(agent, goalId);
        }
      } else if (agent === "general" && goalDiscoveryRequested) {
        const existing = findExistingGoalDiscoverySession();
        if (existing) {
          selectSession(existing);
        } else {
          void (async () => {
            const session = await startChat(agent, null);
            if (!session) return;
            await sendGoalDiscoveryKickoff(session.id);
          })();
        }
      } else {
        void startChat(agent, null);
      }
      searchParams.delete("agent");
      searchParams.delete("goalId");
      searchParams.delete("goalTitle");
      searchParams.delete(GOAL_DISCOVERY_QUERY_PARAM);
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loadingMessages]);

  useEffect(() => {
    if (!loading && (sessions?.length ?? 0) === 0) {
      setSelectedId(null);
      setMessages([]);
      setMessageActions({});
      setCollapsedActionMessages({});
    }
  }, [loading, sessions]);

  useEffect(() => {
    autoResizeComposer();
  }, [input]);

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
                  className={`chat-session-item w-100 border-0 text-start ${
                    session.id === selectedId ? "active" : ""
                  }`}
                  onClick={() => selectSession(session)}
                >
                  <AgentAvatar agent={session.agent_type} size={38} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-semibold small text-truncate chat-session-title">{session.title}</div>
                    <div
                      className="text-faint text-truncate chat-session-meta"
                      style={{ fontSize: "0.72rem" }}
                    >
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
                  <div className="fw-bold text-truncate">{selectedSession.title}</div>
                  <div className="text-faint small text-truncate">
                    {meta ? `${meta.label} · ${meta.description}` : "Assistant conversation"}
                  </div>
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
                    <h3 className="h5 fw-bold mt-3">{selectedSession.title}</h3>
                    <p className="text-muted-2">{meta?.description}</p>
                    {meta && meta.suggestions.length > 0 && (
                      <div className="d-flex flex-column gap-2 mt-4">
                        {meta.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable"
                            onClick={() => prefillComposer(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((message) => {
                    const entries = messageActions[message.id] ?? [];
                    const hasActions = message.role === "assistant" && entries.length > 0;
                    const isCollapsed = collapsedActionMessages[message.id] ?? false;
                    const pendingSaveableCount = entries.filter(
                      (entry) =>
                        entry.status === "idle" &&
                        !entry.action.requires_confirmation &&
                        !entry.action.destructive,
                    ).length;

                    return (
                      <div
                        key={message.id}
                        className={`chat-bubble ${message.role === "user" ? "user" : "assistant"}`}
                      >
                        {message.role === "assistant" ? (
                          <>
                            <MarkdownMessage content={message.content} />
                            {hasActions && (
                              <div className="chat-action-stack">
                                <div className="chat-action-section-header">
                                  <button
                                    type="button"
                                    className="chat-action-toggle"
                                    onClick={() => toggleActionVisibility(message.id)}
                                  >
                                    {isCollapsed ? "Show actions" : "Hide actions"}
                                  </button>
                                </div>

                                {!isCollapsed && (
                                  <>
                                    <div className="chat-action-list">
                                      {entries.map((entry) => (
                                        <div key={entry.action.id} className="chat-action-card">
                                          <div className="chat-action-row">
                                            <span className="chat-action-module">
                                              {actionBadgeLabel(entry.action)}
                                            </span>
                                            <div
                                              className="chat-action-title text-truncate"
                                              title={actionDisplayTitle(entry.action)}
                                            >
                                              {actionDisplayTitle(entry.action)}
                                            </div>
                                            {entry.status === "idle" ? (
                                              <div className="chat-action-controls">
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
                                                    : "Save"}
                                                </button>
                                              </div>
                                            ) : entry.status === "running" ? (
                                              <span className="chat-action-status text-faint">Running…</span>
                                            ) : (
                                              <span
                                                className={`chat-action-status ${
                                                  entry.status === "executed" ? "text-success" : "text-danger"
                                                }`}
                                              >
                                                {entry.status === "executed"
                                                  ? "Done"
                                                  : entry.status === "rejected"
                                                    ? "Skipped"
                                                    : (entry.message ?? "Failed")}
                                              </span>
                                            )}
                                            {entry.link && entry.status === "executed" && (
                                              <Link to={entry.link} className="chat-action-link">
                                                Open
                                              </Link>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {pendingSaveableCount > 0 && (
                                      <div className="chat-action-footer">
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-secondary"
                                          onClick={() => {
                                            if (!selectedSession) return;
                                            void saveAllProposals(selectedSession.id, message.id);
                                          }}
                                        >
                                          Save all
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          message.content
                        )}
                      </div>
                    );
                  })
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
                  ref={composerInputRef}
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
      <Modal show={showPicker} onHide={() => setShowPicker(false)} centered backdrop="static">
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
                onClick={() => void startChat(agent.type)}
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
