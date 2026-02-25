import { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Bot, User, Plus, Package, HelpCircle } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const addMessage = (type: 'user' | 'assistant', content: string) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    addMessage('user', text);

    // Placeholder response — will be replaced with real backend later
    setTimeout(() => {
      addMessage('assistant',
        `I received your message: "${text}"\n\nBackend integration is coming soon. This chat will be able to classify products, answer clarification questions, and show HTS results right here.`
      );
    }, 600);
  };

  const handleQuickAction = (action: string) => {
    if (action === 'classify') {
      addMessage('assistant', 'Sure! Describe the product you want to classify — include material, intended use, and any other details you have.');
    } else if (action === 'explain') {
      addMessage('assistant', 'I can explain any HTS code. Just type the code (e.g., "6109.10") or describe the product category you want to understand.');
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`h-full bg-white border-l border-slate-200 flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 overflow-hidden'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Chat</h3>
            <p className="text-[10px] text-blue-100">Trade compliance assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty state with quick actions */
          <div className="p-5 flex flex-col items-center justify-center h-full">
            <div className="bg-gradient-to-br from-blue-100 to-indigo-100 p-4 rounded-2xl mb-4">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h4 className="text-slate-900 font-semibold mb-1">Corduroy AI</h4>
            <p className="text-slate-500 text-sm text-center mb-6">
              Your AI-powered trade classification assistant
            </p>

            {/* Quick Actions */}
            <div className="w-full space-y-2">
              <button
                onClick={() => handleQuickAction('classify')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-colors text-left group"
              >
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <Package className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <span className="text-slate-900 text-sm font-medium">Classify Product</span>
                  <p className="text-slate-500 text-xs">Describe a product to get HTS code</p>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('explain')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 rounded-xl transition-colors text-left group"
              >
                <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                  <HelpCircle className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <span className="text-slate-900 text-sm font-medium">Explain HTS Code</span>
                  <p className="text-slate-500 text-xs">Understand any tariff classification</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                {message.type === 'assistant' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                {message.type === 'user' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                )}

                {/* Bubble */}
                <div className={`flex-1 ${message.type === 'user' ? 'text-right' : ''}`}>
                  <div
                    className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm max-w-[85%] ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-md'
                        : 'bg-slate-100 text-slate-900 rounded-tl-md'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                  <div className={`text-[10px] text-slate-400 mt-1 px-1 ${message.type === 'user' ? 'text-right' : ''}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a product..."
            className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
