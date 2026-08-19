import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dropdown, Modal } from "react-bootstrap";
import { ArrowRepeat, Check2, ChevronLeft, ChevronRight, Copy, List, PencilSquare, PlusLg, SendFill, Stars, ThreeDotsVertical, Trash3, XLg } from "react-bootstrap-icons";
import ReactMarkdown from "react-markdown";

import boySitting from "@/assets/boy_sitting.png";
import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { ConvoDataShortResponse, GoalProposal, MessageDataResponse } from "@/api/types";
import { ROUTES } from "@/routes/RoutePaths";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { TextFieldPromptDialog } from "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog";
import { AssistantMessageSkeleton } from "@/pages/assistant/AssistantMessageSkeleton";
import { ASSISTANT_AGENTS, ASSISTANT_LOADER_STEPS, type AssistantAgent } from "@/pages/assistant/AssistantPage.constants";
import { RefinedGoalReviewPanel } from "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel";
import { useToast } from "@/context/ToastContext";
import { formatChatTime } from "@/services/chat-time.service";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

import "@/pages/assistant/AssistantPage.scss";

export function AssistantPage() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const [pendingAutoMessage, setPendingAutoMessage] = useState<string | null>(null);

  const [loaderIndex, setLoaderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);
  const [isRenamingConversation, setIsRenamingConversation] = useState(false);
  const [hoveredMsgKey, setHoveredMsgKey] = useState<string | null>(null);
  const [copiedMsgKey, setCopiedMsgKey] = useState<string | null>(null);
  const [contentIndexMap, setContentIndexMap] = useState<Record<string, number>>({});
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);

  const [conversations, setConversations] = useState<ConvoDataShortResponse[]>([]);
  const [messages, setMessages] = useState<MessageDataResponse[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConvoDataShortResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConvoDataShortResponse | null>(null);
  const [renameTarget, setRenameTarget] = useState<ConvoDataShortResponse | null>(null);
  const [reviewingProposal, setReviewingProposal] = useState<GoalProposal | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRequestIdRef = useRef(0);
  const messageRefsMap = useRef<Record<string, HTMLDivElement | null>>({});

  // Derived active item
  const hasAnyChat = conversations.length > 0;
  const activeItem = activeConversation;
  const ActiveIcon = ASSISTANT_AGENTS[activeItem?.agent_type ?? "shadow"].icon;
  const activeAgent = activeItem ? ASSISTANT_AGENTS[activeItem.agent_type] : null;

  useEffect(() => {
    api.chat.getConversations()
      .then((data) => setConversations(prev => {
        // Preserve any local (unsent) sessions already added by openAgent
        const localSessions = prev.filter(c => c.is_local);
        return [...data, ...localSessions];
      }))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const state = location.state as { agentType?: string; autoMessage?: string } | null;
    if (!state?.agentType || !state?.autoMessage) return;
    const agent = ASSISTANT_AGENTS[state.agentType as keyof typeof ASSISTANT_AGENTS];
    if (!agent) return;
    openAgent(agent);
    setPendingAutoMessage(state.autoMessage);
    // Clear state so a page refresh doesn't re-trigger
    window.history.replaceState({}, "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) { setLoaderIndex(0); return; }
    const id = window.setInterval(() => {
      setLoaderIndex(i => Math.min(i + 1, ASSISTANT_LOADER_STEPS.length - 1));
    }, 1100);
    return () => window.clearInterval(id);
  }, [isLoading]);

  useEffect(() => {
    if (chatScrollRef.current)
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages.length, isProcessingMessage]);

  useEffect(() => {
    if (!pendingAutoMessage || !activeConversation) return;
    const message = pendingAutoMessage;
    setPendingAutoMessage(null);
    void sendMessage(message);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoMessage, activeConversation]);

  useEffect(() => {
    if (composerTextareaRef.current) {
      resizeTextareaToMaxLines(composerTextareaRef.current, 5, 20);
    }
  }, [inputText, activeConversation?.id]);

  function openAgent(agent: AssistantAgent) {
    const existing = conversations.find(s => s.is_local && s.agent_type === agent.type);
    messagesRequestIdRef.current += 1;
    setIsLoadingMessages(false);
    setMessages([]);

    if (existing) {
      setActiveConversation(existing);
      setShowNewChatModal(false);
      return;
    }

    const session: ConvoDataShortResponse = {
      id: Date.now(),
      title: agent.label,
      agent_type: agent.type,

      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      is_local: true,
    };

    setConversations(prev => [...prev, session]);
    setActiveConversation(session);
    setShowNewChatModal(false);
  }

  async function getMessages(conversation: ConvoDataShortResponse) {
    const requestId = ++messagesRequestIdRef.current;
    setActiveConversation(conversation);

    if (conversation.is_local) {
      setIsLoadingMessages(false);
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    setMessages([]);

    try {
      const messageChunk = await api.chat.getMessages(conversation.id);
      if (requestId !== messagesRequestIdRef.current) return;
      // TODO take care of pagination 
      setMessages(messageChunk.message_list);
    } catch {
      if (requestId !== messagesRequestIdRef.current) return;
      toast.error("Failed to load messages. Please try again.");
    } finally {
      if (requestId === messagesRequestIdRef.current) {
        setIsLoadingMessages(false);
      }
    }
  }

  async function deleteConversation(data: ConvoDataShortResponse | null) {
    if (!data) return;

    if (!data.is_local) {
      try {
        await api.chat.deleteConversation(data.id);
        setConversations(prev => prev.filter(c => c.id !== data.id));
        setDeleteTarget(null);
      } catch {
        toast.error("Failed to delete conversation. Please try again.");
      }
    } else {
      setConversations(prev => prev.filter(c => c.id !== data.id));
      setDeleteTarget(null);
    }
    if (activeConversation?.id === data.id) setActiveConversation(null);
  }

  async function renameConversation(nextTitle: string) {
    if (!renameTarget || isRenamingConversation) return;

    const fallbackTitle = ASSISTANT_AGENTS[renameTarget.agent_type].label;
    const currentTitle = renameTarget.title || fallbackTitle;
    if (!nextTitle || nextTitle === currentTitle) {
      setRenameTarget(null);
      return;
    }

    if (!renameTarget.is_local) {
      setIsRenamingConversation(true);
      try {
        const updatedConversation = await api.chat.renameConversation(renameTarget.id, { title: nextTitle });
        setConversations(prev => prev.map(item => (
          item.id === updatedConversation.id ? { ...item, ...updatedConversation } : item
        )));

        setActiveConversation(prev => (
          prev?.id === updatedConversation.id ? { ...prev, ...updatedConversation } : prev
        ));

        setRenameTarget(null);
      } catch {
        toast.error("Failed to rename conversation. Please try again.");
      } finally {
        setIsRenamingConversation(false);
      }
      return;
    }

    setConversations(prev => prev.map(item => (
      item.id === renameTarget.id ? { ...item, title: nextTitle } : item
    )));

    setActiveConversation(prev => (
      prev?.id === renameTarget.id ? { ...prev, title: nextTitle } : prev
    ));

    setRenameTarget(null);
  }

  async function sendMessage(content?: string) {
    if (isLoadingMessages) return;

    const text = (content ?? inputText).trim();
    if (!text || !activeItem) return;

    setInputText("");
    const msg: MessageDataResponse = {
      conversation_id: activeItem.id,
      content: [text],
      role: "user",
      linked_items: {},
      created_at: new Date().toISOString(),
    };

    setIsProcessingMessage(true);
    if (activeItem.is_local) {
      setMessages(prev => [...prev, msg]);
      try {
        const response = await api.chat.startConversation({
          content: text,
          agent_type: activeItem.agent_type,
        });
        const activeItemCopy = {
          ...activeItem,
          ...response.conversation_data,
          is_local: false,
        };
        setConversations(prev => prev.map(c => c.id === activeItem.id ? activeItemCopy : c));
        setActiveConversation(activeItemCopy);

        setMessages(prev => [...prev, response.message_data]);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Failed to send message. Please try again.");
      } finally {
        setIsProcessingMessage(false);
      }
    } else {
      setMessages(prev => [...prev, msg]);
      try {
        const response = await api.chat.sendMessage({
          conversation_id: activeItem.id,
          content: text,
        });

        setMessages(prev => [...prev, response.message_data]);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Failed to send message. Please try again.");
      } finally {
        setIsProcessingMessage(false);
      }
    }
  }

  function navigateContent(msgKey: string, contentLength: number, dir: 1 | -1) {
    setContentIndexMap(prev => {
      const current = prev[msgKey] ?? contentLength - 1;
      return { ...prev, [msgKey]: Math.max(0, Math.min(contentLength - 1, current + dir)) };
    });
    setTimeout(() => {
      const el = messageRefsMap.current[msgKey];
      const container = chatScrollRef.current;
      if (!el || !container) return;
      const needed = el.getBoundingClientRect().bottom - container.getBoundingClientRect().bottom + 40;
      if (needed > 0) container.scrollBy({ top: needed, behavior: "smooth" });
    }, 0);
  }

  function copyMessage(content: string, key: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgKey(key);
      setTimeout(() => setCopiedMsgKey(null), 1500);
    });
  }

  function getActiveGoalProposal(msg: MessageDataResponse, contentIndex: number): GoalProposal | undefined {
    return msg.linked_items.goal_proposals?.find(p => p.content_index === contentIndex);
  }

  async function regenerateResponse(message: MessageDataResponse) {
    if (isLoadingMessages || !message.id || !activeItem) return;

    setIsProcessingMessage(true);
    try {
      const response = await api.chat.regenerateResponse({
        conversation_id: activeItem.id,
        message_id: message.id,
      });

      setMessages(prev => prev.map(m => m.id === message.id ? response.message_data : m));
      setContentIndexMap(prev => ({ ...prev, [String(message.id)]: response.message_data.content.length - 1 }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to regenerate response. Please try again.");
    } finally {
      setIsProcessingMessage(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if(!inputText.trim() || isProcessingMessage || isLoadingMessages) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    resizeTextareaToMaxLines(e.target, 5, 20);
  }

  const avatarStyle = (g: [string, string], size: number) => ({
    width: size, height: size, placeItems: "center",
    borderRadius: Math.round(size / 2.6), color: "#fff",
    background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
  });

  if (isLoading) {
    return (
      <div className="page-fill-height">
        <PageHeader title="Assistant" subtitle="Coaching that knows your goals, style and progress." />
        <div className="page-loader">
          <div className="page-loader-message">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            <span>{ASSISTANT_LOADER_STEPS[loaderIndex]}</span>
          </div>
          <div className="page-loader-track" aria-hidden="true">
            {ASSISTANT_LOADER_STEPS.map((_, i) => (
              <span key={i} className={`page-loader-dot${i <= loaderIndex ? " is-active" : ""}`} />
            ))}
          </div>
        </div>
        <div className="assistant-picker">
          <img src={boySitting} alt="" className="assistant-bg-illustration" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const conversationPanel = [...conversations].sort((a, b) => {
    const aTime = new Date(a.updated_at).getTime();
    const bTime = new Date(b.updated_at).getTime();
    return bTime - aTime;
  });

  return (
    <div className={`page-fill-height ${hasAnyChat ? "assistant-page" : ""}`}>
      <div className={`${hasAnyChat ? "hide-page-header" : ""}`}>
        <PageHeader title="Assistant" subtitle="Coaching that knows your goals, style and progress." />
      </div>

      {!hasAnyChat && (
        <div className="assistant-picker">
          <div className="assistant-picker-inner">
            <div className="assistant-list">
              {Object.values(ASSISTANT_AGENTS).map((agent, index) => {
                const Icon = agent.icon;
                const isLast = index === Object.values(ASSISTANT_AGENTS).length - 1;
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
                        <div className="assistant-agent-cta"><span className="assistant-agent-cta-link">Start chat &rarr;</span></div>
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

      {hasAnyChat && (
        <div className="chat-layout">
          <div className={`surface chat-sessions-panel d-flex flex-column${sessionsPanelOpen ? " is-open" : ""}`}>
            <div className="p-2 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
              <button className="btn btn-soft w-100" onClick={() => setShowNewChatModal(true)}>
                <PlusLg size={15} className="me-1" /> New session
              </button>
            </div>
            <div className="chat-sessions flex-grow-1">
              {conversationPanel.map((conversation) => {
                const isActive = activeItem?.id === conversation.id;
                const agent = ASSISTANT_AGENTS[conversation.agent_type];
                const Icon = agent.icon;
                const title = conversation.title || agent.label;
                const onSelect = () => { if (!isActive) { getMessages(conversation); setSessionsPanelOpen(false); } };

                return (
                  <div key={conversation.id} className={`chat-session-row ${isActive ? "active" : ""}`}>
                    <button type="button" className={`chat-session-item w-100 border-0 ${isActive ? "active" : ""}`} onClick={onSelect}>
                      <span className="d-inline-grid flex-shrink-0 icon" style={avatarStyle(agent.gradient, 38)} aria-hidden="true"><Icon size={19} /></span>
                      <div className="flex-grow-1 min-w-0 text-start">
                        <div className="fw-semibold small text-truncate chat-session-title">{title}</div>
                        <div className="text-faint text-truncate chat-session-meta" style={{ fontSize: "0.72rem" }}>{agent.tagline} · {formatChatTime(conversation.updated_at)}</div>
                      </div>
                    </button>
                    <Dropdown
                      align="end"
                      className="chat-session-actions"
                    >
                      <Dropdown.Toggle as="button" className="btn btn-ghost btn-icon border-0 chat-session-action-toggle" aria-label="Session actions" bsPrefix=" ">
                        <ThreeDotsVertical size={15} />
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => setRenameTarget(conversation)}>
                          <span className="d-flex align-items-center"><PencilSquare size={13} className="me-2" /> Rename</span>
                        </Dropdown.Item>
                        <Dropdown.Item className="text-danger" onClick={() => setDeleteTarget(conversation)}>
                          <span className="d-flex align-items-center"><Trash3 size={13} className="me-2" /> Delete</span>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="surface chat-window d-flex">
            {!activeItem ? (
              <>
                <div className="chat-sessions-mobile-bar">
                  <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => setSessionsPanelOpen(o => !o)} aria-label="Open sessions">
                    <List size={20} />
                  </button>
                </div>
                <div className="d-flex align-items-center justify-content-center flex-grow-1 p-4 w-100">
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
              </>
            ) : activeAgent && ActiveIcon ? (
              <>
                <div className="d-flex align-items-center gap-2 border-bottom chat-head" style={{ borderColor: "var(--jv-border)" }}>
                  <button type="button" className="btn btn-ghost btn-icon border-0 chat-sessions-toggle flex-shrink-0" onClick={() => setSessionsPanelOpen(o => !o)} aria-label="Open sessions">
                    <List size={20} />
                  </button>
                  <span className="d-inline-grid flex-shrink-0 active-icon" style={avatarStyle(activeAgent.gradient, 40)} aria-hidden="true">
                    <ActiveIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="fw-bold text-truncate">{activeConversation?.title ?? activeAgent.label}</div>
                    <div className="text-faint small text-truncate">{activeAgent.tagline} · {activeAgent.description}</div>
                  </div>
                  <Dropdown align="end" className="ms-auto flex-shrink-0">
                    <Dropdown.Toggle as="button" className="btn btn-ghost btn-icon border-0" aria-label="Session options" bsPrefix=" ">
                      <ThreeDotsVertical size={16} />
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={() => setRenameTarget(activeConversation)}>
                        <span className="d-flex align-items-center"><PencilSquare size={13} className="me-2" /> Rename</span>
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item onClick={() => setActiveConversation(null)}>
                        <span className="d-flex align-items-center"><XLg size={13} className="me-2" /> Close</span>
                      </Dropdown.Item>
                      <Dropdown.Item className="text-danger" onClick={() => setDeleteTarget(activeConversation)}>
                        <span className="d-flex align-items-center"><Trash3 size={13} className="me-2" /> Delete</span>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>

                <div className="chat-scroll" ref={chatScrollRef}>
                  {isLoadingMessages ? (
                    <AssistantMessageSkeleton />
                  ) : messages.length === 0 ? (
                    <div className="m-auto text-center" style={{ maxWidth: 440 }}>
                      <span className="d-inline-grid" style={avatarStyle(activeAgent.gradient, 64)} aria-hidden="true">
                        <ActiveIcon size={30} />
                      </span>
                      <h3 className="h5 fw-bold mt-3">{activeAgent.label}</h3>
                      <p className="text-muted-2">{activeAgent.description}</p>
                      <div className="d-flex flex-column gap-2 mt-4">
                        {activeAgent.suggestions.map(s => (
                          <button key={s} type="button" className="surface-2 p-2 px-3 border-0 text-start small fw-medium clickable suggestion-chip" onClick={() => sendMessage(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3 p-3">
                      {messages.map((msg, i) => {
                        const msgKey = String(msg.id ?? msg.created_at);
                        const isHovered = hoveredMsgKey === msgKey;
                        const isCopied = copiedMsgKey === msgKey;
                        const activeContentIndex = contentIndexMap[msgKey] ?? msg.content.length - 1;
                        const activeContent = msg.content[activeContentIndex];
                        const activeProposal = getActiveGoalProposal(msg, activeContentIndex);
                        return (
                          <div
                            key={msgKey}
                            ref={(el) => { messageRefsMap.current[msgKey] = el; }}
                            className={`d-flex ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}
                          >
                            <div className={`d-flex flex-column gap-1 ${msg.role === "user" ? "align-items-end" : "align-items-start"}`} style={{ maxWidth: "75%" }}
                              onMouseEnter={() => setHoveredMsgKey(msgKey)}
                              onMouseLeave={() => setHoveredMsgKey(null)}>
                              <div className={`px-3 py-2 rounded-3 small ${msg.role === "user" ? "" : "surface-2"}`}
                                style={msg.role === "user" ? { background: "var(--jv-brand-1)", color: "#fff", whiteSpace: "pre-wrap" } : {}}>
                                <ReactMarkdown
                                  components={{
                                    a: ({ node, ...props }) => (
                                      <a
                                        {...props}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      />
                                    ),
                                  }}
                                  className="chat-markdown"
                                >
                                  {activeContent}
                                </ReactMarkdown>
                                {activeProposal && activeProposal.goal_action === "create" && (
                                  <button
                                    type="button"
                                    className="btn btn-link p-0 fw-medium text-decoration-none mt-1"
                                    style={{ fontSize: "14px" }}
                                    onClick={() => setReviewingProposal(activeProposal)}
                                  >
                                    Open Review Panel &rarr;
                                  </button>
                                )}
                                {activeProposal && activeProposal.goal_action === "view" && activeProposal.goal_id && (
                                  <button
                                    type="button"
                                    className="btn btn-link p-0 fw-medium text-decoration-none mt-1"
                                    style={{ fontSize: "14px" }}
                                    onClick={() => navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(activeProposal.goal_id)))}
                                  >
                                    View Goal &rarr;
                                  </button>
                                )}
                              </div>
                              <div style={{ position: "relative", lineHeight: 1 }}>
                                <span className="text-faint" style={{ fontSize: "0.68rem", opacity: isHovered ? 0 : 1, transition: "opacity 0.18s ease-in-out" }}>
                                  {formatChatTime(msg.created_at)}
                                </span>
                                <div className="chat-message-actions" style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [msg.role === "user" ? "right" : "left"]: 0, opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? "auto" : "none", transition: "opacity 0.18s ease-in-out" }}>
                                  {msg.content.length > 1 && (
                                    <div className="chat-content-nav">
                                      <button 
                                        type="button" 
                                        className="chat-content-nav-btn" 
                                        disabled={activeContentIndex === 0} 
                                        onClick={() => navigateContent(msgKey, msg.content.length, -1)} 
                                        aria-label="Previous version">
                                          <ChevronLeft size={12} />
                                      </button>
                                      <span className="chat-content-nav-label">{activeContentIndex + 1}/{msg.content.length}</span>
                                      <button 
                                        type="button" 
                                        className="chat-content-nav-btn" 
                                        disabled={activeContentIndex === msg.content.length - 1} 
                                        onClick={() => navigateContent(msgKey, msg.content.length, 1)} 
                                        aria-label="Next version">
                                          <ChevronRight size={12} />
                                        </button>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    className="chat-message-action-btn"
                                    onClick={() => copyMessage(activeContent, msgKey)}
                                    aria-label="Copy message"
                                    title={isCopied ? "Copied!" : "Copy"}
                                  >
                                    {isCopied ? <Check2 size={14} /> : <Copy size={14} />}
                                  </button>
                                  {msg.role === "user" && (
                                    <button
                                      type="button"
                                      className="chat-message-action-btn"
                                      onClick={() => setInputText(activeContent)}
                                      aria-label="Edit message"
                                      title="Edit"
                                    >
                                      <PencilSquare size={13} />
                                    </button>
                                  )}
                                  {msg.role === "assistant" && i === messages.length - 1 && (
                                    <button
                                      type="button"
                                      className="chat-message-action-btn"
                                      disabled={isProcessingMessage || isLoadingMessages}
                                      onClick={() => regenerateResponse(msg)}
                                      aria-label="Retry message"
                                      title="Retry"
                                    >
                                      <ArrowRepeat size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {isProcessingMessage && (
                        <div className="d-flex justify-content-start" aria-live="polite" aria-label="Assistant is typing">
                          <div className="d-flex flex-column gap-1 align-items-start" style={{ maxWidth: "75%" }}>
                            <div className="px-3 py-2 rounded-3 small surface-2 assistant-typing-indicator">
                              <span className="assistant-typing-dot" />
                              <span className="assistant-typing-dot" />
                              <span className="assistant-typing-dot" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <form className="chat-composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
                  <textarea className="form-control" rows={1} placeholder={`Message ${activeAgent.label}…`}
                    ref={composerTextareaRef}
                    value={inputText} onChange={handleInputChange} onKeyDown={handleKeyDown} disabled={isLoadingMessages} />
                  <button type="submit" className="btn btn-brand flex-shrink-0" aria-label="Send message" disabled={!inputText.trim() || isProcessingMessage || isLoadingMessages}>
                    <SendFill size={16} />
                  </button>
                </form>
              </>
            ) : null}
          </div>
          <div className={`chat-sessions-backdrop${sessionsPanelOpen ? " is-open" : ""}`} onClick={() => setSessionsPanelOpen(false)} />
        </div>
      )}

      <Modal show={showNewChatModal} onHide={() => setShowNewChatModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Choose an assistant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column gap-2">
            {Object.values(ASSISTANT_AGENTS).map(agent => {
              const Icon = agent.icon;
              return (
                <button key={agent.type} type="button" className="surface-2 p-3 border-0 text-start d-flex align-items-center gap-3 clickable hover-lift w-100" onClick={() => openAgent(agent)}>
                  <span className="d-inline-grid flex-shrink-0" style={avatarStyle(agent.gradient, 44)} aria-hidden="true"><Icon size={22} /></span>
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
        onConfirm={() => deleteConversation(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      <TextFieldPromptDialog
        show={renameTarget !== null}
        title="Rename session"
        message="Update the session name to make it easier to find later."
        label="Session name"
        initialValue={renameTarget ? (renameTarget.title || ASSISTANT_AGENTS[renameTarget.agent_type].label) : ""}
        placeholder="Enter session name"
        confirmLabel="Rename"
        busy={isRenamingConversation}
        maxLength={30}
        onConfirm={renameConversation}
        onCancel={() => {
          setIsRenamingConversation(false);
          setRenameTarget(null);
        }}
      />

      {reviewingProposal && (
        <RefinedGoalReviewPanel
          proposal={reviewingProposal}
          onClose={() => setReviewingProposal(null)}
          onSaved={(goal) => {
            const proposalId = reviewingProposal.proposal_id;
            setMessages(prev => prev.map(m => {
              if (!m.linked_items.goal_proposals?.some(p => p.proposal_id === proposalId)) return m;
              return {
                ...m,
                linked_items: {
                  ...m.linked_items,
                  goal_proposals: m.linked_items.goal_proposals!.map(p => (
                    p.proposal_id === proposalId ? { ...p, status: "saved", goal_id: goal.id, goal_action: "view" } : p
                  )),
                },
              };
            }));
            toast.success("Goal created successfully.");
          }}
        />
      )}
    </div>
  );
}

