import { useState, useRef, useEffect } from 'react';
import { Send, ChevronsRight, Pin, Wand2, BookOpen, FileSearch, BarChart3, Sparkles } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
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
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
    }]);
  };

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    const text = input.trim();
    setInput('');
    addMessage('user', text);

    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      addMessage('assistant',
        `I received your message about "${text}". Backend integration is coming soon — this chat will classify products, handle clarifications, and show HTS results inline.`
      );
    }, 900);
  };

  const handleSuggestion = (action: string) => {
    const prompts: Record<string, string> = {
      classify: 'Describe the product you want to classify — include material, intended use, and any relevant details.',
      explain: 'I can explain any HTS code. Type the code (e.g. "6109.10") or describe the product category.',
      analyze: 'I can analyze your recent classifications for patterns, common issues, or optimization opportunities. What would you like to review?',
      review: 'I can help you review exception items. Would you like me to pull up your pending exceptions?',
    };
    addMessage('assistant', prompts[action] || 'How can I help?');
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setIsThinking(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-[400px] flex-shrink-0 bg-white border-l border-slate-200 flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 h-[52px] border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-slate-400" />
          <span className="text-[14px] font-medium text-slate-700">AI Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            title="Pin chat"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            title="Close sidebar"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">

        {messages.length === 0 ? (
          /* ── Empty state ── */
          <div className="px-4 pt-12 pb-6">
            <div className="mb-8 px-2">
              <h3 className="text-[15px] font-medium text-slate-800 mb-1">Your personal customs expert</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                What do you want to do today?
              </p>
            </div>

            {/* Suggestion rows */}
            <div className="space-y-0.5">
              <button
                onClick={() => handleSuggestion('classify')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors group"
              >
                <Wand2 className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                <div>
                  <span className="text-[13px] text-slate-700 group-hover:text-slate-900">Classify a product</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Describe a product to get HTS codes</p>
                </div>
              </button>

              <button
                onClick={() => handleSuggestion('explain')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors group"
              >
                <BookOpen className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                <div>
                  <span className="text-[13px] text-slate-700 group-hover:text-slate-900">Explain an HTS code</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Look up what a code covers</p>
                </div>
              </button>

              <button
                onClick={() => handleSuggestion('analyze')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors group"
              >
                <BarChart3 className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                <div>
                  <span className="text-[13px] text-slate-700 group-hover:text-slate-900">Analyze classifications</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Review patterns and common issues</p>
                </div>
              </button>

              <button
                onClick={() => handleSuggestion('review')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors group"
              >
                <FileSearch className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                <div>
                  <span className="text-[13px] text-slate-700 group-hover:text-slate-900">Review exceptions</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Pull up items that need attention</p>
                </div>
              </button>
            </div>
          </div>

        ) : (
          /* ── Messages ── */
          <div className="px-4 py-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="bg-slate-100 text-slate-800 text-[13px] leading-relaxed px-3.5 py-2.5 rounded-2xl rounded-tr-md max-w-[85%]">
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1.5 px-0.5">AI</p>
                    <div className="text-[13px] leading-relaxed text-slate-700">
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {isThinking && (
              <div>
                <p className="text-[11px] text-slate-400 font-medium mb-1.5 px-0.5">AI</p>
                <div className="flex items-center gap-1.5 h-5 px-0.5">
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="px-3 py-3 border-t border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-0.5 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI anything..."
            disabled={isThinking}
            className="flex-1 py-2 bg-transparent text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-50"
          />
          {input.trim() && (
            <button
              onClick={handleSend}
              disabled={isThinking}
              className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
