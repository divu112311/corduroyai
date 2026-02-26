import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, AlertCircle } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { cn } from './ui/utils';
import logo from '../assets/8dffc9a46764dc298d3dc392fb46f27f3eb8c7e5.png';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MessageSection {
  heading?: string;
  content?: string;
  bullets?: string[];
  metadata?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  sections?: MessageSection[];
  isError?: boolean;
  timestamp: number;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GRADIENT = 'linear-gradient(135deg, #6366F1, #8B5CF6, #06B6D4)';
const TIMESTAMP_STYLE: React.CSSProperties = { fontSize: '11px', lineHeight: 1, color: '#9CA3AF' };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Confidence indicator bar */
function ConfidenceBar({ confidence }: { confidence: number }) {
  const color =
    confidence <= 50
      ? '#EF4444'
      : confidence <= 75
        ? '#F59E0B'
        : '#22C55E';

  const label =
    confidence <= 50 ? 'Low' : confidence <= 75 ? 'Medium' : 'High';

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#6b7280' }}>{label} confidence</span>
        <span className="text-xs font-medium" style={{ color: '#374151' }}>{confidence}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 6, width: '100%', background: '#e5e7eb' }}>
        <div
          className="rounded-full dynamic-bar dynamic-bar-color"
          style={{
            height: '100%',
            transition: 'all 300ms',
            '--bar-width': `${confidence}%`,
            '--bar-color': color,
          } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

/** Structured AI response sections */
function StructuredContent({ sections }: { sections: MessageSection[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="mt-3">
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <h4 className="text-left mb-2" style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
              {section.heading}
            </h4>
          )}
          {section.content && (
            <p className="text-sm" style={{ color: '#374151', lineHeight: 1.6 }}>{section.content}</p>
          )}
          {section.bullets && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="mt-2">
              {section.bullets.map((bullet, j) => (
                <li key={j} className="text-sm flex" style={{ color: '#374151', lineHeight: 1.6, gap: 8 }}>
                  <span className="flex-shrink-0" style={{ color: '#9ca3af', marginTop: 2 }}>&bull;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {section.metadata && (
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{section.metadata}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ChatPanel({ isOpen, onClose, onOpen }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
    ]);
  }, []);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    const text = input.trim();
    setInput('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    addMessage({ role: 'user', content: text });

    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      addMessage({
        role: 'assistant',
        content: `Got it, classifying your product...`,
      });
    }, 900);
  };

  const handleSuggestion = () => {
    addMessage({
      role: 'assistant',
      content:
        'Describe the product you want to classify — include material, intended use, and any relevant details.',
    });
  };

  const handleRetry = (msg: ChatMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={onOpen}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-white flex items-center justify-center cursor-pointer chat-trigger"
          style={{ zIndex: 9999, boxShadow: '0px 8px 24px rgba(0,0,0,0.08)', transition: 'transform 150ms, background 150ms' }}
          title="Corduroy AI"
          aria-label="Open chat"
        >
          <img src={logo} alt="Corduroy AI" style={{ width: 28, height: 28 }} />
        </button>
      )}

      {/* Docked right sidebar */}
      <div
        className={cn(
          'chat-panel-docked',
          isOpen && 'chat-panel-open'
        )}
        role="dialog"
        aria-label="Corduroy AI Chat"
        aria-hidden={!isOpen}
      >
        <div className="chat-panel-inner">
        {/* Header — branded */}
        <div className="chat-header px-4 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: '#22C55E' }} aria-label="Online" />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.025em' }}>
              Trade Assistant
            </span>
          </div>
          <button
            onClick={onClose}
            className="chat-close-btn w-8 h-8 flex items-center justify-center rounded-full"
            aria-label="Close chat panel"
          >
            <X style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable messages */}
        <div
          ref={scrollRef}
          className="chat-messages flex-1 overflow-y-auto p-4 flex flex-col gap-3 chat-scrollbar-hidden"
        >
          {/* Loading skeleton */}
          {isLoading && (
            <div className="py-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton className="chat-skeleton rounded-lg" style={{ height: 16, width: '75%' }} />
              <Skeleton className="chat-skeleton rounded-lg" style={{ height: 16, width: '50%' }} />
              <Skeleton className="chat-skeleton rounded-lg" style={{ height: 16, width: '66%' }} />
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center flex-1" style={{ paddingLeft: 24, paddingRight: 24 }}>
              <img src={logo} alt="" className="w-10 h-10 mb-4" />
              <p className="font-medium mb-2 text-center" style={{ fontSize: 15 }}>
                What are you shipping?
              </p>
              <p className="text-sm mb-6 text-center" style={{ color: '#6b7280' }}>
                Describe your product and I'll find the right HTS code.
              </p>
              <button
                onClick={handleSuggestion}
                className="h-10 px-5 rounded-full text-white text-sm font-medium"
                style={{ background: GRADIENT }}
              >
                Classify a product
              </button>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                msg.isError ? (
                  /* Error state */
                  <div
                    key={msg.id}
                    className="chat-error-bubble chat-msg-ai rounded-2xl chat-msg-enter"
                    style={{ padding: '10px 14px' }}
                  >
                    <div className="flex items-start" style={{ gap: 8 }}>
                      <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} strokeWidth={1.5} />
                      <p className="text-sm" style={{ lineHeight: 1.6 }}>{msg.content}</p>
                    </div>
                    <button
                      onClick={() => handleRetry(msg)}
                      className="text-sm font-medium mt-2"
                      style={{ color: '#3b82f6' }}
                    >
                      Try again
                    </button>
                  </div>
                ) : msg.role === 'user' ? (
                  /* User bubble */
                  <div
                    key={msg.id}
                    className="chat-msg-user chat-msg-enter"
                  >
                    <div
                      className="w-fit ml-auto rounded-xl text-white"
                      style={{ padding: '12px 14px', background: GRADIENT, fontSize: 14, lineHeight: 1.6 }}
                    >
                      <span className="whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{msg.content}</span>
                    </div>
                    <p className="mt-1 text-right mr-1" style={TIMESTAMP_STYLE}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                ) : (
                  /* AI bubble — with background + avatar */
                  <div
                    key={msg.id}
                    className="chat-msg-ai flex items-start chat-msg-enter"
                    style={{ gap: 10 }}
                  >
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                         style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <img src={logo} alt="AI" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                    </div>
                    <div>
                      <div
                        className="chat-bubble-ai rounded-xl"
                        style={{ padding: '12px 14px', fontSize: 14, lineHeight: 1.6 }}
                      >
                        <span className="whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{msg.content}</span>
                        {msg.confidence !== undefined && (
                          <ConfidenceBar confidence={msg.confidence} />
                        )}
                        {msg.sections && (
                          <StructuredContent sections={msg.sections} />
                        )}
                      </div>
                      <p className="mt-1 ml-1" style={TIMESTAMP_STYLE}>
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                )
              ))}

              {/* Typing indicator — opacity fade */}
              {isThinking && (
                <div className="flex items-start" style={{ alignSelf: 'flex-start', gap: 10 }}>
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                       style={{ background: '#ffffff', border: '1px solid #e2e8f0', opacity: 0.6 }}>
                    <img src={logo} alt="AI" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                  </div>
                  <div className="chat-typing-dots flex items-center h-8 rounded-2xl" style={{ gap: 6, paddingLeft: 12, paddingRight: 12 }}>
                    <div className="chat-dot rounded-full chat-dot-fade chat-dot-delay-0" style={{ width: 6, height: 6 }} />
                    <div className="chat-dot rounded-full chat-dot-fade chat-dot-delay-1" style={{ width: 6, height: 6 }} />
                    <div className="chat-dot rounded-full chat-dot-fade chat-dot-delay-2" style={{ width: 6, height: 6 }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input section */}
        <div className="px-4 py-3 flex-shrink-0 border-t" style={{ borderColor: 'var(--chat-panel-border)', background: 'var(--chat-panel-bg)' }}>
          <div className="chat-input-wrap flex items-center rounded-xl" style={{ gap: 8, padding: '8px 14px' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={isThinking}
              rows={1}
              className="chat-textarea flex-1 resize-none"
              style={{ fontSize: 14 }}
            />
            <button
              onClick={handleSend}
              disabled={isThinking || !input.trim()}
              className="chat-send-btn w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center"
              aria-label="Send message"
            >
              <Send style={{ width: 18, height: 18 }} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        </div>{/* end chat-panel-inner */}
      </div>
    </>
  );
}
