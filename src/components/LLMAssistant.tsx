import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Minimize2, Maximize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LLMAssistantProps {
  productContext?: {
    name: string;
    description: string;
    hts?: string;
    origin?: string;
  };
  onClose?: () => void;
  isMinimizable?: boolean;
}

export function LLMAssistant({ productContext, onClose, isMinimizable = true }: LLMAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: productContext 
        ? `I'm here to help you classify "${productContext.name}". I can answer questions about HS/HTS codes, tariff rates, trade agreements, and help clarify product characteristics for accurate classification. What would you like to know?`
        : `I'm your trade compliance assistant. I can help you understand HS/HTS codes, tariff rates, and product classification rules. How can I assist you today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate LLM response
    setTimeout(() => {
      let assistantResponse = '';

      const lowerInput = input.toLowerCase();

      if (lowerInput.includes('material') || lowerInput.includes('composition')) {
        assistantResponse = `For accurate HS/HTS classification, material composition is crucial. For ${productContext?.name || 'this product'}, I need to know:\n\n1. What is the primary material by weight?\n2. Are there any secondary materials that make up more than 10% of the product?\n3. For textiles: Is it woven, knitted, or non-woven?\n\nFor example, if a product is 60% cotton and 40% polyester, it would typically be classified based on the cotton (primary material). This affects the tariff rate significantly.`;
      } else if (lowerInput.includes('tariff') || lowerInput.includes('duty')) {
        assistantResponse = `Tariff rates depend on three key factors:\n\n1. **HTS Code**: The classification determines the base rate\n2. **Country of Origin**: Different countries have different rates\n3. **Trade Agreements**: Various free trade agreements may apply\n\nFor ${productContext?.name || 'this product'}${productContext?.origin ? ` from ${productContext.origin}` : ''}, check if any preferential trade programs apply based on the country of origin.\n\nWould you like me to explain how to calculate landed cost?`;
      } else if (lowerInput.includes('primary function') || lowerInput.includes('purpose')) {
        assistantResponse = `The "primary function" determines classification when a product could fit multiple categories. Ask yourself:\n\n1. What does this product do PRIMARILY?\n2. If it has multiple functions, which one is most important to the user?\n3. What would a typical consumer say this product is for?\n\nFor example, a smartwatch could be:\n- A watch (Chapter 91)\n- A fitness tracker (Chapter 90)\n- A communication device (Chapter 85)\n\nThe primary function (timekeeping vs. health monitoring vs. communication) determines the classification. What do you think is the primary function of ${productContext?.name || 'this product'}?`;
      } else if (lowerInput.includes('how') || lowerInput.includes('why') || lowerInput.includes('explain')) {
        assistantResponse = `I'd be happy to explain! ${productContext ? `For "${productContext.name}"${productContext.hts ? ` classified as HTS ${productContext.hts}` : ''}, ` : ''}let me break it down:\n\nHS/HTS codes are structured hierarchically:\n- First 2 digits: Chapter (product category)\n- Next 2 digits: Heading (sub-category)\n- Next 2 digits: Subheading (further detail)\n- Last 4 digits: US-specific detail\n\nThe classification follows these rules:\n1. Describe the product accurately\n2. Determine the chapter based on material or function\n3. Apply General Rules of Interpretation (GRI)\n4. Consider Explanatory Notes\n\nWhat specific aspect would you like me to clarify?`;
      } else if (lowerInput.includes('alternative') || lowerInput.includes('different code')) {
        assistantResponse = `When considering alternative HTS codes, evaluate:\n\n1. **Material Composition**: Is there a code more specific to the primary material?\n2. **Function vs. Form**: Sometimes products are classified by what they do, other times by what they're made of\n3. **Tariff Optimization**: Check if a different (but legally correct) classification offers better rates\n\n⚠️ Important: Always choose the MOST SPECIFIC code that accurately describes your product. Using an incorrect code to get a lower tariff is illegal.\n\nFor ${productContext?.name || 'this product'}, which aspect are you most uncertain about - material, function, or specific features?`;
      } else {
        assistantResponse = `Great question! ${productContext ? `For "${productContext.name}", ` : ''}let me help you with that.\n\nTo give you the most accurate guidance, could you provide more details about:\n\n1. The exact materials or components\n2. The primary intended use\n3. Any specific features that make it unique\n4. Country of manufacture\n\nThis will help me provide specific classification guidance and relevant tariff information.`;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 z-40"
      >
        <Bot className="w-6 h-6" />
        <span>AI Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl border border-slate-200 w-96 h-[600px] flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 p-2 rounded-lg">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3>Trade Compliance AI</h3>
            <p className="text-xs text-blue-100">Ask me anything</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isMinimizable && (
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Context Banner */}
      {productContext && (
        <div className="p-3 bg-blue-50 border-b border-blue-200 text-sm">
          <div className="text-blue-900">Current Product:</div>
          <div className="text-blue-700">{productContext.name}</div>
          {productContext.hts && (
            <div className="text-blue-600 text-xs mt-1">HTS: {productContext.hts}</div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              message.role === 'assistant' 
                ? 'bg-blue-100 text-blue-600' 
                : 'bg-slate-200 text-slate-700'
            }`}>
              {message.role === 'assistant' ? (
                <Bot className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </div>
            <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
              <div
                className={`inline-block p-3 rounded-lg text-sm ${
                  message.role === 'assistant'
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-slate-100 p-3 rounded-lg">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 space-y-1">
          <p className="text-xs text-slate-600 mb-2">Suggested questions:</p>
          {[
            'What materials affect classification?',
            'How do I determine primary function?',
            'Why are there alternative codes?'
          ].map((question) => (
            <button
              key={question}
              onClick={() => setInput(question)}
              className="block w-full text-left px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}