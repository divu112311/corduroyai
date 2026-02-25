import { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, User, RotateCcw, Wand2, BookOpen, FileSearch, BarChart3 } from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  const addMessage = (type: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      content,
      timestamp: new Date(),
    }]);
  };

  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    const text = input.trim();
    setInput('');
    addMessage('user', text);

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addMessage('assistant',
        `I received: "${text}"\n\nBackend integration coming soon. This chat will classify products, handle clarifications, and show HTS results inline.`
      );
    }, 800);
  };

  const handleQuickAction = (action: string) => {
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
    setIsTyping(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/10 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-screen w-[420px] bg-white border-l border-slate-200 shadow-xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header — clean, like Notion */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-slate-900">New AI chat</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleNewChat}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="New chat"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {messages.length === 0 ? (
            /* Empty state — Notion style */
            <div className="flex flex-col items-center px-8 pt-16 pb-6">
              {/* AI Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-200/50">
                <Sparkles className="w-7 h-7 text-white" />
              </div>

              <h3 className="text-[17px] font-semibold text-slate-900 mb-1">Corduroy AI</h3>
              <p className="text-sm text-slate-500 text-center mb-8">
                Your trade classification assistant
              </p>

              {/* Quick action chips — horizontal wrap like Notion */}
              <div className="flex flex-wrap gap-2 justify-center w-full">
                <button
                  onClick={() => handleQuickAction('classify')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-full text-sm text-slate-700 hover:text-blue-700 transition-all"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Classify
                </button>
                <button
                  onClick={() => handleQuickAction('explain')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 rounded-full text-sm text-slate-700 hover:text-purple-700 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Explain code
                </button>
                <button
                  onClick={() => handleQuickAction('analyze')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-full text-sm text-slate-700 hover:text-emerald-700 transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Analyze
                </button>
                <button
                  onClick={() => handleQuickAction('review')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 rounded-full text-sm text-slate-700 hover:text-amber-700 transition-all"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  Review exceptions
                </button>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="px-5 py-5 space-y-5">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.type === 'assistant'
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      : 'bg-slate-200'
                  }`}>
                    {message.type === 'assistant'
                      ? <Sparkles className="w-4 h-4 text-white" />
                      : <User className="w-4 h-4 text-slate-500" />
                    }
                  </div>

                  {/* Content */}
                  <div className={`flex-1 min-w-0 ${message.type === 'user' ? 'flex flex-col items-end' : ''}`}>
                    <div className={`px-4 py-3 text-[14px] leading-relaxed rounded-2xl max-w-[88%] ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-md'
                        : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-md'
                    }`}>
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {/* Typing */}
              {isTyping && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-md">
                    <div className="flex gap-1.5 items-center h-5">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input — clean bottom bar */}
        <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent focus-within:bg-white transition-all">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Do anything with AI..."
              disabled={isTyping}
              className="flex-1 py-2.5 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
