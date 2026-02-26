import { useState, useRef, useEffect } from 'react';
import { Send, ChevronsRight, Pin, MessageSquare, AlertCircle } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { cn } from './ui/utils';

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
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
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
        <span className="text-xs text-gray-500">{label} confidence</span>
        <span className="text-xs font-medium text-gray-700">{confidence}%</span>
      </div>
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${confidence}%`, backgroundColor: color }}
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
            <h4 className="text-base font-semibold text-gray-900 mb-2 text-left">
              {section.heading}
            </h4>
          )}
          {section.content && (
            <p className="text-sm text-gray-700 leading-[1.5]">{section.content}</p>
          )}
          {section.bullets && (
            <ul className="space-y-2 mt-2">
              {section.bullets.map((bullet, j) => (
                <li key={j} className="text-sm text-gray-700 leading-[1.5] flex gap-2">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">&bull;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {section.metadata && (
            <p className="text-xs text-gray-500 mt-1">{section.metadata}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const addMessage = (msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
  };

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    const text = input.trim();
    setInput('');
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

  return (
    <div
      style={{ width: '380px', flexShrink: 0, overflow: 'hidden' }}
      className="flex flex-col bg-white border-l border-gray-200"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0">
        {/* 3px gradient accent strip */}
        <div
          className="w-[3px] self-stretch rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 leading-[1.3]">
            AI Chat
          </h2>
          <p className="text-xs font-normal text-gray-500 mt-0.5">
            Last synced just now
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-[120ms]"
            title="Pin chat"
            aria-label="Pin chat panel"
          >
            <Pin className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-[120ms]"
            title="Close chat"
            aria-label="Close chat panel"
          >
            <ChevronsRight className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-5"
      >
        {/* Loading state: skeleton */}
        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-3/4 rounded-md bg-gray-100" />
            <Skeleton className="h-4 w-1/2 rounded-md bg-gray-100" />
            <Skeleton className="h-4 w-2/3 rounded-md bg-gray-100" />
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <MessageSquare
              className="w-8 h-8 text-gray-400 mb-4"
              strokeWidth={1.5}
            />
            <p className="text-sm text-gray-700 mb-6 text-center">
              Ask me about HTS codes, classifications, or product compliance.
            </p>
            <button
              onClick={handleSuggestion}
              className="h-10 px-4 rounded-[10px] bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors duration-[120ms]"
            >
              Classify a product
            </button>
          </div>
        ) : (
          /* Message bubbles */
          <div className="py-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {/* Error state */}
                {msg.isError ? (
                  <div className="max-w-[70%] bg-red-50 text-red-700 px-4 py-3 rounded-2xl">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <p className="text-sm leading-[1.5]">{msg.content}</p>
                    </div>
                    <button
                      onClick={() => handleRetry(msg)}
                      className="mt-3 h-8 px-3 rounded-lg text-xs font-medium text-red-700 border border-red-300 hover:bg-red-100 transition-colors duration-[120ms]"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'max-w-[70%] px-4 py-3 rounded-2xl',
                      'text-sm font-normal leading-[1.5]',
                      msg.role === 'user'
                        ? 'bg-blue-100/60 text-gray-900'
                        : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </span>
                    {/* Confidence */}
                    {msg.confidence !== undefined && (
                      <ConfidenceBar confidence={msg.confidence} />
                    )}
                    {/* Structured responses */}
                    {msg.sections && (
                      <StructuredContent sections={msg.sections} />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl">
                  <div className="flex items-center gap-1.5 h-5">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input field */}
      <div className="px-5 pb-5 pt-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI anything..."
            disabled={isThinking}
            className={cn(
              'flex-1 h-12 px-4 text-sm bg-white',
              'border border-gray-300 rounded-[10px]',
              'outline-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 focus:border-transparent',
              'placeholder:text-gray-400',
              'disabled:opacity-50',
              'transition-colors duration-[120ms]'
            )}
          />
          <button
            onClick={handleSend}
            disabled={isThinking || !input.trim()}
            className={cn(
              'h-10 px-4 rounded-[10px]',
              'bg-blue-500 text-white',
              'hover:bg-blue-600 active:bg-blue-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors duration-[120ms]',
              'flex items-center justify-center',
              'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2'
            )}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
