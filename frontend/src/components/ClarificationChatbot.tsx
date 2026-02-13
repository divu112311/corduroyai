import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { ClarificationMessage } from '../lib/classificationService';

interface ClarificationChatbotProps {
  messages: ClarificationMessage[];
  onSendMessage: (message: string) => Promise<void>;
  isLoading?: boolean;
}

export function ClarificationChatbot({ messages, onSendMessage, isLoading = false }: ClarificationChatbotProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const messageText = input.trim();
    setInput('');
    await onSendMessage(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-slate-200 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-slate-900 font-semibold">Clarification Needed</h3>
            <p className="text-slate-600 text-sm">Please provide the requested information to continue classification</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Bot className="w-12 h-12 mx-auto mb-3 text-slate-400" />
            <p>Waiting for clarification questions...</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.type === 'user_response' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {message.type !== 'user_response' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
              )}
              {message.type === 'user_response' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
              )}
              <div className={`flex-1 ${message.type === 'user_response' ? 'text-right' : ''}`}>
                <div
                  className={`inline-block p-3 rounded-lg text-sm max-w-[85%] ${
                    message.type === 'user_response'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : message.type === 'question'
                      ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-sm'
                      : 'bg-slate-100 text-slate-900 rounded-tl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
                <div className={`text-xs text-slate-500 mt-1 ${message.type === 'user_response' ? 'text-right' : ''}`}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-slate-100 p-3 rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your response..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}




