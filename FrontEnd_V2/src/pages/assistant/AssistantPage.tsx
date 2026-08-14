import { useEffect, useRef, useState } from "react";
import { Dropdown, Modal } from "react-bootstrap";
import { PlusLg, SendFill, Stars, ThreeDotsVertical, Trash3, XLg } from "react-bootstrap-icons";
import ReactMarkdown from "react-markdown";

import boySitting from "@/assets/boy_sitting.png";
import { api } from "@/api";
import type { ConversationData, MessageData } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ASSISTANT_AGENTS, ASSISTANT_LOADER_STEPS, type AssistantAgent } from "@/pages/assistant/AssistantPage.constants";
import { useToast } from "@/context/ToastContext";
import { formatChatTime } from "@/services/chat-time.service";

import "@/pages/assistant/AssistantPage.scss";

export function AssistantPage() {
  const toast = useToast();

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [inputText, setInputText] = useState("");

  const [loaderIndex, setLoaderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);

  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationData | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Derived active item
  const hasAnyChat = conversations.length > 0;
  const activeItem = activeConversation;
  const ActiveIcon = ASSISTANT_AGENTS[activeItem?.agent_type ?? "shadow"].icon;
  const activeAgent = activeItem ? ASSISTANT_AGENTS[activeItem.agent_type] : null;

  useEffect(() => {
    api.chat.getConversations()
      .then((data) => setConversations(data))
      .finally(() => setIsLoading(false));
  }, []);

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
  }, [messages.length]);

  function openAgent(agent: AssistantAgent) {
    const existing = conversations.find(s => s.is_local && s.agent_type === agent.type);
    setMessages([]);

    if (existing) {
      setActiveConversation(existing);
      setShowNewChatModal(false);
      return;
    }

    const session: ConversationData = {
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

  async function getMessages(conversation: ConversationData) {
    setActiveConversation(conversation);

    if (conversation.is_local) {
      setMessages([]);
      return;
    }

    setIsLoadingChats(true);
    try {
      const msgs = await api.chat.getMessages(conversation.id);
      setMessages(msgs);
    } catch {
      toast.error("Failed to load messages. Please try again.");
    } finally {
      setIsLoadingChats(false);
    }
  }

  async function deleteConversation(data: ConversationData | null) {
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

  async function sendMessage(content?: string) {
    const text = (content ?? inputText).trim();
    if (!text || !activeItem) return;

    setInputText("");
    const msg: MessageData = {
      conversation_id: activeItem.id,
      content: text,
      role: "user",
      created_at: new Date().toISOString(),
    };

    setIsProcessingMessage(true);
    if (activeItem.is_local) {
      setMessages(prev => [...prev, msg]);
      try {
        const response = await api.chat.startConversation({
          content: text,
          conversation_id: activeItem.id,
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
      } catch {
        toast.error("Failed to send message. Please try again.");
      } finally {
        setIsProcessingMessage(false);
      }
    } else {
      setMessages(prev => [...prev, msg]);
      try {
        const response = await api.chat.sendMessage({
          conversation_id: activeItem.id,
          content: text,
          role: "user",
          created_at: new Date().toISOString(),
        });

        setMessages(prev => [...prev, response.message_data]);
      } catch {
        toast.error("Failed to send message. Please try again.");
      } finally {
        setIsProcessingMessage(false);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
    <div className="page-fill-height">
      <PageHeader title="Assistant" subtitle="Coaching that knows your goals, style and progress." />

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
          <div className="surface chat-sessions-panel d-flex flex-column">
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
                const onSelect = () => { getMessages(conversation); };

                return (
                  <button key={conversation.id} type="button" className={`chat-session-item w-100 border-0 ${isActive ? "active" : ""}`} onClick={onSelect}>
                    <span className="d-inline-grid flex-shrink-0" style={avatarStyle(agent.gradient, 38)} aria-hidden="true"><Icon size={19} /></span>
                    <div className="flex-grow-1 min-w-0 text-start">
                      <div className="fw-semibold small text-truncate chat-session-title">{title}</div>
                      <div className="text-faint text-truncate chat-session-meta" style={{ fontSize: "0.72rem" }}>{agent.tagline} · {formatChatTime(conversation.updated_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="surface chat-window d-flex">
            {!activeItem ? (
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
            ) : activeAgent && ActiveIcon ? (
              <>
                <div className="d-flex align-items-center gap-2 p-3 border-bottom" style={{ borderColor: "var(--jv-border)" }}>
                  <span className="d-inline-grid flex-shrink-0" style={avatarStyle(activeAgent.gradient, 40)} aria-hidden="true">
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
                  {messages.length === 0 ? (
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
                      {messages.map(msg => (
                        <div key={msg.id ?? msg.created_at} className={`d-flex ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}>
                          <div className={`d-flex flex-column gap-1 ${msg.role === "user" ? "align-items-end" : "align-items-start"}`} style={{ maxWidth: "75%" }}>
                            <div className={`px-3 py-2 rounded-3 small ${msg.role === "user" ? "" : "surface-2"}`}
                              style={msg.role === "user" ? { background: "var(--jv-brand-1)", color: "#fff", whiteSpace: "pre-wrap" } : {}}>
                              {/* {msg.role === "user"
                                ? msg.content
                                : <ReactMarkdown className="chat-markdown">{msg.content}</ReactMarkdown>
                              } */}
                              <ReactMarkdown className="chat-markdown">{msg.content}</ReactMarkdown>
                            </div>
                            <span className="text-faint" style={{ fontSize: "0.68rem" }}>{formatChatTime(msg.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form className="chat-composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
                  <textarea className="form-control" rows={1} placeholder={`Message ${activeAgent.label}…`}
                    value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} />
                  <button type="submit" className="btn btn-brand flex-shrink-0" aria-label="Send message" disabled={!inputText.trim() || isProcessingMessage}>
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
    </div>
  );
}

