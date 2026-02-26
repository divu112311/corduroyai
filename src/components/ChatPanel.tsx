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
    <div className="mt-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label} confidence</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{confidence}%</span>
      </div>
      <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 dynamic-bar dynamic-bar-color"
          style={{ '--bar-width': `${confidence}%`, '--bar-color': color } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

/** Structured AI response sections */
function StructuredContent({ sections }: { sections: MessageSection[] }) {
  return (
    <div className="space-y-4 mt-3">
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 text-left">
              {section.heading}
            </h4>
          )}
          {section.content && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-[1.5]">{section.content}</p>
          )}
          {section.bullets && (
            <ul className="space-y-2 mt-2">
              {section.bullets.map((bullet, j) => (
                <li key={j} className="text-sm text-gray-700 dark:text-gray-300 leading-[1.5] flex gap-2">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">&bull;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {section.metadata && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{section.metadata}</p>
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
        content: `I received your message about "${text}". Backend integration is coming soon — this chat will classify products, handle clarifications, and show HTS results inline.`,
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
          className="fixed bottom-6 right-6 z-[9999] w-12 h-12 rounded-full
                     bg-white dark:bg-[#1C1C1E]
                     shadow-[0px_8px_24px_rgba(0,0,0,0.08)]
                     hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2E]
                     active:scale-[0.97] active:duration-[80ms]
                     flex items-center justify-center cursor-pointer
                     transition-[transform,background] duration-150"
          title="Corduroy AI"
          aria-label="Open chat"
        >
          <img src={logo} alt="Corduroy AI" className="w-7 h-7" />
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
        <div className="h-[56px] px-5 flex items-center justify-between flex-shrink-0
                        border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1C1C1E]">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="w-5 h-5" />
            <span className="text-gray-900 dark:text-gray-100"
                  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '15px', lineHeight: 1.3 }}>
              Corduroy
            </span>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center
                       text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
                       rounded-lg transition-colors duration-150"
            aria-label="Close chat panel"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 chat-scrollbar-hidden"
        >
          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3 py-4">
              <Skeleton className="h-4 w-3/4 rounded-md bg-gray-100 dark:bg-gray-800" />
              <Skeleton className="h-4 w-1/2 rounded-md bg-gray-100 dark:bg-gray-800" />
              <Skeleton className="h-4 w-2/3 rounded-md bg-gray-100 dark:bg-gray-800" />
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <img src={logo} alt="" className="w-10 h-10 mb-4 opacity-40" />
              <p className="text-[15px] font-medium text-gray-900 dark:text-gray-100 mb-2 text-center">
                What are you shipping?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
                Describe your product and I'll find the right HTS code.
              </p>
              <button
                onClick={handleSuggestion}
                className="h-10 px-5 rounded-full bg-gray-900 dark:bg-white
                           text-white dark:text-gray-900 text-sm font-medium
                           hover:opacity-90 active:scale-[0.97]
                           transition-all duration-150"
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
                    className="self-start max-w-[85%] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
                               px-3.5 py-2.5 rounded-2xl chat-msg-enter"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <p className="text-sm leading-[1.5]">{msg.content}</p>
                    </div>
                    <button
                      onClick={() => handleRetry(msg)}
                      className="mt-2 text-sm font-medium text-blue-500 hover:text-blue-600
                                 transition-colors duration-150"
                    >
                      Try again
                    </button>
                  </div>
                ) : msg.role === 'user' ? (
                  /* User bubble */
                  <div
                    key={msg.id}
                    className="self-end max-w-[75%] chat-msg-enter"
                  >
                    <div className="px-3.5 py-2.5 rounded-2xl
                                    bg-[#F2F2F7] dark:bg-[#2C2C2E]
                                    text-sm text-gray-900 dark:text-gray-100">
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 text-right mr-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                ) : (
                  /* AI bubble — with background + avatar */
                  <div
                    key={msg.id}
                    className="self-start max-w-[85%] flex gap-2 chat-msg-enter"
                  >
                    <img src={logo} alt="" className="w-5 h-5 mt-1 flex-shrink-0" />
                    <div>
                      <div className="px-3.5 py-2.5 rounded-2xl bg-[#F7F7F8] dark:bg-[#2C2C2E]
                                      text-sm text-gray-700 dark:text-gray-300 leading-[1.5]">
                        <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                        {msg.confidence !== undefined && (
                          <ConfidenceBar confidence={msg.confidence} />
                        )}
                        {msg.sections && (
                          <StructuredContent sections={msg.sections} />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 ml-1">
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                )
              ))}

              {/* Typing indicator — opacity fade */}
              {isThinking && (
                <div className="self-start flex gap-2">
                  <img src={logo} alt="" className="w-5 h-5 mt-1 flex-shrink-0 opacity-50" />
                  <div className="flex items-center gap-1.5 h-8 px-3 rounded-2xl bg-[#F7F7F8] dark:bg-[#2C2C2E]">
                    <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full chat-dot-fade chat-dot-delay-0" />
                    <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full chat-dot-fade chat-dot-delay-1" />
                    <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full chat-dot-fade chat-dot-delay-2" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input section */}
        <div className="px-5 py-3 flex-shrink-0 bg-[#F5F5F5] dark:bg-[#2C2C2E]
                        border-t border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={isThinking}
              rows={1}
              className={cn(
                'flex-1 min-h-[40px] max-h-[120px] resize-none',
                'border-none outline-none',
                'bg-white dark:bg-[#1C1C1E]',
                'rounded-[14px] px-3.5 py-2.5 text-sm',
                'text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus:shadow-[0_0_0_2px_rgba(0,122,255,0.25)]',
                'disabled:opacity-50',
                'transition-shadow duration-150'
              )}
            />
            <button
              onClick={handleSend}
              disabled={isThinking || !input.trim()}
              className={cn(
                'w-9 h-9 flex-shrink-0 rounded-full',
                'bg-blue-500 text-white',
                'flex items-center justify-center',
                'hover:bg-blue-600',
                'disabled:opacity-40 disabled:pointer-events-none',
                'active:scale-[0.97] active:duration-[80ms]',
                'transition-all duration-150'
              )}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        </div>{/* end chat-panel-inner */}
      </div>
    </>
  );
}
