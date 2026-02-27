import { useState, useRef, useEffect } from 'react';
import { AlertCircle, CheckCircle, X, ArrowLeft, Sparkles, ThumbsUp, ThumbsDown, MessageSquare, Upload, FileText, Send, Lightbulb, Info, Plus, Loader2 } from 'lucide-react';
import { getClassificationRun, addClarificationMessage, ClarificationMessage } from '../lib/classificationService';
import { classifyProduct, clarifyBulkItem } from '../lib/supabaseFunctions';
import { supabase } from '../lib/supabase';

interface AlternateClassification {
  hts: string;
  description: string;
  confidence: number;
  cbp_rulings?: any[];
  rationale?: string;
  rule_verification?: any;
}

interface ExceptionReviewProps {
  product: {
    id: number | string;
    productName: string;
    description: string;
    hts: string;
    confidence: number;
    tariff: string;
    origin: string;
    reason: string;
    // Extended classification data
    hts_description?: string;
    reasoning?: string;
    chapter_code?: string;
    chapter_title?: string;
    section_code?: string;
    section_title?: string;
    cbp_rulings?: any[];
    rule_verification?: any;
    rule_confidence?: number;
    alternate_classifications?: AlternateClassification[];
    classification_run_id?: number;
  };
  readOnly?: boolean;
  bulkRunId?: string;
  bulkItemId?: string;
  clarificationQuestions?: Array<{ question: string; options: string[] }> | null;
  onClose: () => void;
  onApprove: (updatedProduct?: any) => void;
  onReject: () => void;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  timestamp?: string;
}

export function ExceptionReview({ product, readOnly, bulkRunId, bulkItemId, clarificationQuestions, onClose, onApprove, onReject }: ExceptionReviewProps) {
  const [selectedHts, setSelectedHts] = useState(product.hts);
  const [notes, setNotes] = useState('');
  const [currentConfidence, setCurrentConfidence] = useState(product.confidence);
  const [previousConfidence, setPreviousConfidence] = useState(product.confidence);
  const [materialsProvided, setMaterialsProvided] = useState(false);
  const [primaryUseProvided, setPrimaryUseProvided] = useState(false);
  const [certificationProvided, setCertificationProvided] = useState(false);
  const [resolvedIssues, setResolvedIssues] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved conversation history from classification run on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      const introMessages: ChatMessage[] = [
        {
          role: 'assistant',
          text: `I see you're reviewing "${product.productName}". I've flagged this with ${product.confidence}% confidence because of some ambiguity in the classification. Let me walk you through what I found and how we can resolve this together.`,
          timestamp: 'Just now'
        },
      ];

      // If bulk clarification questions are available, show them
      if (clarificationQuestions && clarificationQuestions.length > 0) {
        const questionLines = clarificationQuestions.map((q, i) => {
          const optionsText = q.options && q.options.length > 0
            ? `\n   Options: ${q.options.join(', ')}`
            : '';
          return `${i + 1}. ${q.question}${optionsText}`;
        }).join('\n');
        introMessages.push({
          role: 'assistant',
          text: `To improve the classification, I need some additional information:\n\n${questionLines}\n\nPlease answer these questions in the chat, or upload supporting documents.`,
          timestamp: 'Just now'
        });
      } else {
        introMessages.push({
          role: 'assistant',
          text: `The main challenge here is determining the product's primary function. I've suggested HTS ${product.hts}, but there are a few other possibilities depending on specific details. Feel free to ask me questions or upload any supporting documents you have!`,
          timestamp: 'Just now'
        });
      }

      if (!product.classification_run_id) {
        setChatMessages(introMessages);
        return;
      }

      setIsLoadingHistory(true);
      try {
        const run = await getClassificationRun(product.classification_run_id);
        if (run?.conversations && run.conversations.length > 0) {
          // Map saved ClarificationMessages to ChatMessages
          const historyMessages: ChatMessage[] = run.conversations.map((msg: ClarificationMessage) => ({
            role: msg.type === 'user_response' ? 'user' as const : 'assistant' as const,
            text: msg.content,
            timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          }));

          // Show history header, then saved messages, then intro for this review session
          setChatMessages([
            {
              role: 'assistant',
              text: `📋 **Previous Classification Conversation** (${historyMessages.length} message${historyMessages.length !== 1 ? 's' : ''})`,
              timestamp: run.created_at ? new Date(run.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
            },
            ...historyMessages,
            {
              role: 'assistant',
              text: '---\n**Continuing review...**',
              timestamp: 'Now',
            },
            ...introMessages,
          ]);
        } else {
          setChatMessages(introMessages);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        setChatMessages(introMessages);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [product.classification_run_id]);

  // Use real alternate classifications from database, or empty array if not available
  const alternatives: Array<{
    hts: string;
    confidence: number;
    description: string;
    tariff: string;
    reasoning: string;
  }> = (product.alternate_classifications || []).map((alt: AlternateClassification) => ({
    hts: alt.hts || 'N/A',
    confidence: alt.confidence || 0,
    description: alt.description || '',
    tariff: 'N/A',
    reasoning: alt.rationale || '',
  }));

  // Filter out the proposed classification from alternatives
  const filteredAlternatives = alternatives.filter(alt => alt.hts !== product.hts);

  // Build confidence analysis from real rule_verification data
  const rv = product.rule_verification;
  const confidenceAnalysis = {
    primaryIssues: [
      // Issues from checks_failed
      ...(rv?.checks_failed || []).map((check: string) => ({
        issue: check,
        explanation: '',
        impact: 'high' as const,
        resolved: false,
      })),
      // Issues from missing_info
      ...(rv?.missing_info || []).map((info: string) => ({
        issue: info,
        explanation: 'Additional information needed for accurate classification.',
        impact: 'medium' as const,
        resolved: false,
      })),
      // If no real data, show a generic low-confidence issue
      ...(!rv || ((!rv.checks_failed || rv.checks_failed.length === 0) && (!rv.missing_info || rv.missing_info.length === 0))
        ? [{
            issue: `Classification confidence is ${product.confidence}%`,
            explanation: product.reason || 'The classification needs review before approval.',
            impact: (product.confidence < 60 ? 'high' : 'medium') as 'high' | 'medium',
            resolved: false,
          }]
        : []),
    ],
    suggestedActions: [
      ...(rv?.missing_info || []).map((info: string) => `Provide: ${info}`),
      ...(rv?.missing_info?.length ? [] : [
        'Upload product specification sheet or marketing materials',
        'Provide additional product details to improve confidence',
      ]),
    ],
    checksPassed: rv?.checks_passed || [],
    griApplied: rv?.gri_applied || [],
    reasoning: rv?.reasoning || '',
  };

  const updateConfidenceScore = (newIssuesResolved: string[]) => {
    let confidenceBoost = 0;
    const newlyResolved = newIssuesResolved.filter(issue => !resolvedIssues.includes(issue));

    // Each resolved issue provides a confidence boost based on type
    newlyResolved.forEach(issue => {
      if (issue === 'primary_use') confidenceBoost += 10;
      else if (issue === 'materials') confidenceBoost += 8;
      else if (issue === 'certification') confidenceBoost += 7;
      else confidenceBoost += 5; // generic boost for other info
    });

    if (confidenceBoost > 0) {
      setPreviousConfidence(currentConfidence);
      const newConfidence = Math.min(currentConfidence + confidenceBoost, 95);
      setCurrentConfidence(newConfidence);
      setResolvedIssues(prev => [...prev, ...newlyResolved]);
      
      // Add a confidence update notification
      setTimeout(() => {
        const confidenceMessage: ChatMessage = {
          role: 'assistant',
          text: `🎉 **Confidence Updated!** Based on the information you provided, I've increased the confidence score from ${currentConfidence}% → ${newConfidence}% (+${confidenceBoost}%). ${newConfidence >= 85 ? 'This classification is now high confidence and ready for approval!' : 'Keep providing details to boost confidence further.'}`,
          timestamp: 'Just now'
        };
        setChatMessages(prev => [...prev, confidenceMessage]);
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 1000);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isSendingMessage) return;

    const userMessage: ChatMessage = {
      role: 'user',
      text: chatInput,
      timestamp: 'Just now'
    };

    setChatMessages(prev => [...prev, userMessage]);
    const userInput = chatInput;
    setChatInput('');

    // Analyze user input for information provided (confidence boost logic)
    const lowerInput = userInput.toLowerCase();
    const newIssuesResolved: string[] = [];

    if ((lowerInput.includes('health') || lowerInput.includes('fitness') || lowerInput.includes('monitor') || lowerInput.includes('track')) &&
        (lowerInput.includes('primary') || lowerInput.includes('main') || lowerInput.includes('marketed'))) {
      if (!primaryUseProvided) {
        setPrimaryUseProvided(true);
        newIssuesResolved.push('primary_use');
      }
    }

    const hasMaterialKeyword = lowerInput.includes('material') || lowerInput.includes('made') ||
                                lowerInput.includes('composition') || lowerInput.includes('fabric');
    const hasMaterialType = lowerInput.includes('cotton') || lowerInput.includes('polyester') ||
                           lowerInput.includes('wool') || lowerInput.includes('nylon') ||
                           lowerInput.includes('leather') || lowerInput.includes('rubber') ||
                           lowerInput.includes('aluminum') || lowerInput.includes('steel') ||
                           lowerInput.includes('plastic') || lowerInput.includes('silicone') ||
                           lowerInput.includes('metal');
    const hasPercentage = lowerInput.match(/\d+\s*%/);

    if (!materialsProvided && ((hasMaterialKeyword && hasMaterialType) || hasPercentage)) {
      setMaterialsProvided(true);
      newIssuesResolved.push('materials');
    }

    if (lowerInput.includes('fda') || lowerInput.includes('ce mark') || lowerInput.includes('certified') ||
        lowerInput.includes('class ii') || lowerInput.includes('medical device')) {
      if (!certificationProvided) {
        setCertificationProvided(true);
        newIssuesResolved.push('certification');
      }
    }

    if (newIssuesResolved.length > 0) {
      updateConfidenceScore(newIssuesResolved);
    }

    // If this is a bulk classification item with a backend run, call the clarification endpoint
    if (bulkRunId && bulkItemId) {
      setIsSendingMessage(true);

      // Build answers object from user input mapped to clarification questions
      const answers: Record<string, string> = {};
      if (clarificationQuestions && clarificationQuestions.length > 0) {
        clarificationQuestions.forEach((q, idx) => {
          answers[`q${idx}`] = userInput;
        });
      } else {
        answers['clarification'] = userInput;
      }

      try {
        const result = await clarifyBulkItem(bulkRunId, bulkItemId, answers);

        if (result && result.status === 'completed') {
          const matchedRules = result.classification_result?.matched_rules || [];
          const topRule = matchedRules[0];
          const newConfidence = matchedRules.length > 0
            ? Math.round(Math.max(...matchedRules.map((r: any) => r.confidence || 0)) * 100)
            : currentConfidence;

          setPreviousConfidence(currentConfidence);
          setCurrentConfidence(newConfidence);

          if (topRule?.hts) {
            setSelectedHts(topRule.hts);
          }

          const assistantMessage: ChatMessage = {
            role: 'assistant',
            text: `Thanks for the clarification! I've re-classified this product with the additional context you provided.\n\n${topRule ? `📋 Updated HTS: ${topRule.hts}\n📊 Confidence: ${newConfidence}%\n💰 Tariff: ${topRule.tariff_rate ? `${(topRule.tariff_rate * 100).toFixed(1)}%` : 'N/A'}` : ''}${newConfidence >= 85 ? '\n\n✅ This classification is now high confidence and ready for approval!' : '\n\nYou can provide more details to further improve the confidence score.'}`,
            timestamp: 'Just now'
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        } else if (result && result.status === 'exception') {
          const newQuestions = result.clarification_questions || [];
          const questionText = newQuestions.length > 0
            ? newQuestions.map((q: any, i: number) => `${i + 1}. ${q.question}`).join('\n')
            : 'Could you provide more specific details about this product?';

          const assistantMessage: ChatMessage = {
            role: 'assistant',
            text: `Thank you for that information. I still need a bit more to finalize the classification:\n\n${questionText}`,
            timestamp: 'Just now'
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        } else {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            text: 'I received your input but had trouble processing the re-classification. You can try providing more specific details or upload a supporting document.',
            timestamp: 'Just now'
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        }
      } catch (err) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          text: 'Sorry, there was an error processing your clarification. Please try again.',
          timestamp: 'Just now'
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      } finally {
        setIsSendingMessage(false);
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
      return;
    }

    // Save user message to classification run conversations if we have a run ID
    if (product.classification_run_id) {
      try {
        await addClarificationMessage(product.classification_run_id, {
          step: 'rulings',
          type: 'user_response',
          content: userInput,
          timestamp: new Date().toISOString(),
          metadata: { source: 'exception_review' },
        });
      } catch (error) {
        console.error('Error saving chat message:', error);
      }
    }

    // Call the backend API for a real response
    setIsSendingMessage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const contextDescription = `${product.productName}. ${product.description || ''}. Additional info from user: ${userInput}`;

      const response = await classifyProduct(
        contextDescription,
        user.id,
        undefined,
        {
          originalQuery: product.productName,
          clarificationResponse: userInput,
        }
      );

      let aiResponse = '';

      if (response) {
        if (response.needs_clarification && response.questions && response.questions.length > 0) {
          aiResponse = `Based on your input, I have a few follow-up questions:\n\n${response.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}\n\nPlease provide any details you can.`;
        } else if (response.clarifications && response.clarifications.length > 0) {
          aiResponse = `Thank you for the information! I'd like to clarify:\n\n${response.clarifications.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}`;
        } else if (response.matches) {
          const matchesArray = Array.isArray(response.matches)
            ? response.matches
            : (response.matches as any)?.matched_rules || [];

          if (matchesArray.length > 0) {
            const topMatch = matchesArray[0];
            const confidence = topMatch.confidence || topMatch.score || 0;
            const confidencePercent = Math.round(confidence * 100);
            aiResponse = `Thanks for the additional information! Based on your input, I've refined the classification:\n\n**Top match:** HTS ${topMatch.hts} — ${topMatch.description}\n**Confidence:** ${confidencePercent}%${topMatch.rationale ? `\n**Reasoning:** ${topMatch.rationale}` : ''}\n\n${matchesArray.length > 1 ? `I also found ${matchesArray.length - 1} alternative${matchesArray.length > 2 ? 's' : ''}. ` : ''}Would you like more details or want to provide additional information?`;
          } else {
            aiResponse = `Thank you for the information about "${product.productName}". I've processed your input. Can you provide any additional details like material composition or primary use case to help refine the classification?`;
          }
        } else {
          aiResponse = `Thank you for the information about "${product.productName}". I've noted your input. Is there anything else you can share to help refine the classification?`;
        }
      } else {
        // API call returned null — use fallback
        aiResponse = getFallbackResponse(userInput, lowerInput);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: aiResponse,
        timestamp: 'Just now'
      };

      setChatMessages(prev => [...prev, assistantMessage]);

      // Save AI response to classification run conversations
      if (product.classification_run_id) {
        try {
          await addClarificationMessage(product.classification_run_id, {
            step: 'rulings',
            type: 'question',
            content: aiResponse,
            timestamp: new Date().toISOString(),
            metadata: { source: 'exception_review' },
          });
        } catch (error) {
          console.error('Error saving AI response:', error);
        }
      }
    } catch (error) {
      console.error('Error calling classification API:', error);
      // Fallback to template response
      const fallbackResponse = getFallbackResponse(userInput, lowerInput);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: fallbackResponse,
        timestamp: 'Just now'
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsSendingMessage(false);
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Fallback template responses when API is unavailable
  const getFallbackResponse = (userInput: string, lowerInput: string): string => {
    const altList = filteredAlternatives.length > 0
      ? filteredAlternatives.map(a => `HTS ${a.hts} (${a.description})`).join(', ')
      : 'other possible classifications';

    if (lowerInput.includes('primary function') || lowerInput.includes('main use')) {
      return `Great question! The primary function determines the HTS classification. For "${product.productName}", the current classification is HTS ${product.hts}. ${filteredAlternatives.length > 0 ? `Alternatives include ${altList}.` : ''} Can you clarify the primary intended use of this product?`;
    } else if (lowerInput.includes('material') || lowerInput.includes('made of') || lowerInput.match(/\d+\s*%/)) {
      return `Material details will help refine the classification for "${product.productName}". The material composition can affect which HTS subheading applies. Can you provide the full material breakdown (e.g., percentages of each material)? Or upload a spec sheet with this information.`;
    } else if (lowerInput.includes('medical') || lowerInput.includes('fda') || lowerInput.includes('certified')) {
      return `Certifications can significantly impact classification. If "${product.productName}" has relevant certifications (FDA, CE, etc.), it may qualify for a different HTS code with potentially different duty rates. Do you have certification documents you can share?`;
    } else if (lowerInput.includes('tariff') || lowerInput.includes('duty') || lowerInput.includes('rate') || lowerInput.includes('save') || lowerInput.includes('cost')) {
      let tariffInfo = `Current classification HTS ${product.hts}: ${product.tariff} duty rate.`;
      if (filteredAlternatives.length > 0) {
        tariffInfo += '\n\nAlternative classifications:\n' + filteredAlternatives.map(a => `HTS ${a.hts}: ${a.tariff} duty`).join('\n');
      }
      return `${tariffInfo}\n\nGetting the classification right can have a significant impact on your duty costs. Would you like to explore which classification best fits your product?`;
    } else if (lowerInput.includes('help') || lowerInput.includes('what do you need') || lowerInput.includes('how can')) {
      const missingInfo = product.rule_verification?.missing_info || [];
      if (missingInfo.length > 0) {
        return `To improve the confidence score for "${product.productName}", I need:\n\n${missingInfo.map((info: string, i: number) => `${i + 1}. ${info}`).join('\n')}\n\nYou can type the details or upload documents using the button below.`;
      }
      return `I'm here to help! Here's what would improve the confidence score:\n\n1. Product specification sheet\n2. Primary use case details\n3. Material composition\n4. Any relevant certifications\n\nYou can type details or upload documents using the button below.`;
    }
    return `Thanks for the information about "${product.productName}"! To help refine the classification, you can:\n\n• Upload a product specification sheet\n• Describe the primary use case\n• Provide material composition details\n• Share any certifications\n\nWhat would you like to provide?`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);

    // Add immediate acknowledgment
    const uploadMessage: ChatMessage = {
      role: 'assistant',
      text: `Got it! I'm analyzing ${files.map(f => f.name).join(', ')} now... give me just a moment.`,
      timestamp: 'Just now'
    };
    setChatMessages(prev => [...prev, uploadMessage]);
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    // Simulate AI analyzing the uploaded document and update confidence
    setTimeout(() => {
      // Determine what information the document provides
      const newIssuesResolved: string[] = [];
      
      // Assume documents provide comprehensive information
      if (!materialsProvided) {
        setMaterialsProvided(true);
        newIssuesResolved.push('materials');
      }
      if (!primaryUseProvided) {
        setPrimaryUseProvided(true);
        newIssuesResolved.push('primary_use');
      }
      if (!certificationProvided) {
        setCertificationProvided(true);
        newIssuesResolved.push('certification');
      }

      // Update confidence based on document analysis
      if (newIssuesResolved.length > 0) {
        updateConfidenceScore(newIssuesResolved);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: `I've reviewed the document${files.length > 1 ? 's' : ''} you uploaded for "${product.productName}". This additional documentation helps improve the classification confidence. The information from these documents will be factored into the analysis.\n\nWould you like me to update the recommended classification based on this new information?`,
        timestamp: 'Just now'
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 2500);
  };

  const handleHtsSelection = (hts: string) => {
    setSelectedHts(hts);
    
    // Add AI response when user selects a different HTS
    if (hts !== selectedHts) {
      setTimeout(() => {
        const selectedAlt = alternatives.find(a => a.hts === hts);
        const isOriginal = hts === product.hts;
        
        let responseText = '';
        if (isOriginal) {
          responseText = `You've selected my original suggestion (${hts}). This is still a valid option, though the ${product.confidence}% confidence means we should verify the details before finalizing. Want to discuss what's causing the uncertainty?`;
        } else if (selectedAlt) {
          responseText = `Good eye! You've selected ${hts} (${selectedAlt.description}) at ${selectedAlt.tariff} duty. ${selectedAlt.reasoning}. This could work if the product characteristics match. What made you consider this classification?`;
        }
        
        const message: ChatMessage = {
          role: 'assistant',
          text: responseText,
          timestamp: 'Just now'
        };
        setChatMessages(prev => [...prev, message]);
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    
    // Add AI response when user starts adding substantial notes
    if (text.length > 50 && notes.length <= 50) {
      setTimeout(() => {
        const message: ChatMessage = {
          role: 'assistant',
          text: "I see you're adding detailed notes – that's great for audit trail and future reference! These notes will be saved with the product profile and can help if you classify similar items later.",
          timestamp: 'Just now'
        };
        setChatMessages(prev => [...prev, message]);
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 1000);
    }
  };

  const handleApprove = () => {
    console.log('Approved:', selectedHts, notes);
    onApprove({
      hts: selectedHts,
      confidence: currentConfidence,
      tariff: product.tariff,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-slate-900">{readOnly ? 'Classification Details' : 'Low Confidence Classification Review'}</h2>
                {readOnly && (
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approved
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-sm">{product.productName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Main Content - Split View */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Product Info & Classifications */}
          <div className={`${readOnly ? 'w-full' : 'w-1/2 border-r border-slate-200'} overflow-y-auto p-6 space-y-6`}>
            {/* Exception Alert - hidden for approved items */}
            {!readOnly && (
            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-amber-900 mb-1">Why is this classification low confidence?</h3>
                  <p className="text-amber-700 text-sm mb-3">{product.reason}</p>
                  <div className="flex items-center gap-2">
                    {previousConfidence !== currentConfidence && (
                      <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs line-through">
                        {previousConfidence}% Confidence Score
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs transition-all ${
                      currentConfidence >= 85 ? 'bg-green-100 text-green-700' :
                      currentConfidence >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {currentConfidence}% Confidence Score
                      {previousConfidence !== currentConfidence && (
                        <span className="ml-1">↑</span>
                      )}
                    </span>
                    <span className="text-amber-600 text-xs">
                      {currentConfidence >= 85 ? '• Ready for approval!' : '• Needs review before approval'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* AI Confidence Analysis - hidden for approved items */}
            {!readOnly && (
            <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-200">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h3 className="text-slate-900">AI Analysis</h3>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-slate-900 text-sm mb-2">Primary Issues Detected:</h4>
                  <div className="space-y-2">
                    {confidenceAnalysis.primaryIssues.map((item, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border transition-all ${
                        item.resolved
                          ? 'bg-green-50 border-green-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-start gap-2 mb-1">
                          {item.resolved ? (
                            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-600" />
                          ) : (
                            <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                              item.impact === 'high' ? 'text-red-600' : 'text-amber-600'
                            }`} />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${
                                item.resolved
                                  ? 'text-green-900 line-through'
                                  : 'text-slate-900'
                              }`}>
                                {item.issue}
                              </span>
                              {item.resolved ? (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                  resolved
                                </span>
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  item.impact === 'high'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {item.impact}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-1 ${
                              item.resolved ? 'text-green-700' : 'text-slate-600'
                            }`}>
                              {item.resolved
                                ? '✓ Information provided - issue resolved'
                                : item.explanation
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-slate-900 text-sm mb-2">Suggested Actions:</h4>
                  <ul className="space-y-1.5">
                    {confidenceAnalysis.suggestedActions.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            )}

            {/* Product Information */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-slate-900 mb-3">Product Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-600 block mb-1">Product Name</span>
                  <span className="text-slate-900">{product.productName}</span>
                </div>
                <div>
                  <span className="text-slate-600 block mb-1">Country of Origin</span>
                  <span className="text-slate-900">{product.origin}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-600 block mb-1">Description</span>
                  <span className="text-slate-700">{product.description}</span>
                </div>
              </div>
            </div>

            {/* AI Suggested Classification */}
            <div className="bg-white border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="text-slate-900">Proposed Classification</h3>
              </div>

              <div 
                onClick={() => handleHtsSelection(product.hts)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedHts === product.hts 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="mb-3">
                  <div className="text-blue-600 text-sm mb-1">{product.hts}</div>
                  {product.hts_description && (
                    <div className="text-slate-700 text-xs mb-2">
                      <span>{product.hts_description}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 text-xs rounded ${
                      currentConfidence >= 85 ? 'bg-green-100 text-green-700' :
                      currentConfidence >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      Confidence: {currentConfidence}%
                    </span>
                    {previousConfidence !== currentConfidence && (
                      <span className="px-2 py-1 text-xs rounded bg-slate-200 text-slate-600 line-through">
                        {previousConfidence}%
                      </span>
                    )}
                    <span className="text-slate-600 text-sm ml-auto">Tariff: {product.tariff}</span>
                    {selectedHts === product.hts && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </div>

                {(product.chapter_code || product.section_code) && (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="text-slate-900 text-sm mb-2">
                      Classification Hierarchy
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {product.section_code && (
                        <div className="flex items-start gap-2">
                          <span className="text-slate-600 min-w-[80px]">Section</span>
                          <span className="text-slate-700">{product.section_code}{product.section_title ? ` — ${product.section_title}` : ''}</span>
                        </div>
                      )}
                      {product.chapter_code && (
                        <div className="flex items-start gap-2">
                          <span className="text-slate-600 min-w-[80px]">Chapter</span>
                          <span className="text-slate-700">{product.chapter_code}{product.chapter_title ? ` — ${product.chapter_title}` : ''}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-slate-600 min-w-[80px]">HTS Code</span>
                        <span className="text-slate-700">{product.hts}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Alternative Classifications */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-slate-900">Alternative Classifications</h3>
              </div>
              <div className="space-y-2">
                {filteredAlternatives.map((alt, index) => (
                  <div 
                    key={index}
                    onClick={() => handleHtsSelection(alt.hts)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedHts === alt.hts 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <span className="text-slate-900 text-sm block mb-2">{alt.hts}</span>
                        <p className="text-slate-700 text-xs mb-2">{alt.description}</p>
                        
                        {alt.reasoning && (
                          <div className="text-xs text-slate-600 mb-2">
                            <span className="text-slate-500">Reasoning:</span> {alt.reasoning}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          alt.confidence >= 75 ? 'bg-green-100 text-green-700' :
                          alt.confidence >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {alt.confidence}%
                        </span>
                        {selectedHts === alt.hts && (
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                      <span className="text-slate-600">Tariff: {alt.tariff}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Classification Reasoning */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-3 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-indigo-900">Classification Reasoning for Customs Validation</h3>
                </div>
                <p className="text-indigo-700 text-sm">Detailed justification for HTS {selectedHts}</p>
              </div>
              
              <div className="p-5 space-y-5 bg-white">
                {/* Classification Decision */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">1</div>
                    <h4 className="text-slate-900">Classification Decision</h4>
                  </div>
                  <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                    <p className="text-slate-700 text-sm mb-3">
                      <strong>HTS Code {selectedHts}</strong> was selected based on the product's primary function, material composition, and physical characteristics.
                    </p>
                    {product.reasoning ? (
                      <p className="text-slate-600 text-sm whitespace-pre-wrap">{product.reasoning}</p>
                    ) : (
                      <p className="text-slate-600 text-sm">
                        This classification aligns with the Harmonized Tariff Schedule of the United States (HTSUS).
                        {product.chapter_code && ` Chapter ${product.chapter_code}${product.chapter_title ? `: ${product.chapter_title}` : ''}.`}
                      </p>
                    )}
                  </div>
                </div>

                {(confidenceAnalysis.griApplied.length > 0 || confidenceAnalysis.checksPassed.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">2</div>
                    <h4 className="text-slate-900">General Rules of Interpretation (GRI)</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    {confidenceAnalysis.griApplied.map((gri: string, idx: number) => (
                      <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-green-900">{gri}</p>
                        </div>
                      </div>
                    ))}
                    {confidenceAnalysis.checksPassed.map((check: string, idx: number) => (
                      <div key={`check-${idx}`} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-green-900">{check}</p>
                        </div>
                      </div>
                    ))}
                    {confidenceAnalysis.reasoning && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm text-slate-700">{confidenceAnalysis.reasoning}</p>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Material Composition Analysis */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">3</div>
                    <h4 className="text-slate-900">Material Composition Analysis</h4>
                  </div>
                  <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                    <p className="text-slate-700 text-sm mb-2"><strong>Product Description:</strong> {product.description}</p>
                    <p className="text-slate-600 text-sm">
                      Material composition has been reviewed to meet the requirements for classification under this HTS code. The product's construction and materials align with Section Notes and Chapter Notes for this classification.
                    </p>
                  </div>
                </div>

                {/* Country of Origin Impact */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">4</div>
                    <h4 className="text-slate-900">Country of Origin Impact</h4>
                  </div>
                  <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                    <p className="text-slate-700 text-sm mb-2"><strong>Origin:</strong> {product.origin}</p>
                    <p className="text-slate-600 text-sm mb-3">
                      Country of origin affects duty rates and trade agreement eligibility. For products from {product.origin}, the following apply:
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                        <span className="text-slate-600">MFN (Most Favored Nation) tariff rate: {product.tariff}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                        <span className="text-slate-600">Special tariff programs may apply</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alternative Classifications Considered */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">5</div>
                    <h4 className="text-slate-900">Alternative Classifications Considered</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    {alternatives.map((alt, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm text-slate-700 mb-1"><strong>Alternative {idx + 1}:</strong> HTS {alt.hts} ({alt.confidence}% confidence)</p>
                        <p className="text-xs text-slate-600 mb-1">{alt.description}</p>
                        <p className="text-xs text-slate-600"><strong>Reasoning:</strong> {alt.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Supporting Documentation */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">6</div>
                    <h4 className="text-slate-900">Supporting Documentation</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    {/* CBP Rulings as supporting evidence */}
                    {product.cbp_rulings && product.cbp_rulings.length > 0 ? (
                      product.cbp_rulings.map((ruling: any, idx: number) => (
                        <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm text-blue-900 font-medium">{ruling.ruling_number}</p>
                              <p className="text-xs text-blue-700 mt-1">{ruling.subject}</p>
                              {ruling.ruling_date && (
                                <p className="text-xs text-blue-600 mt-1">Date: {ruling.ruling_date}</p>
                              )}
                            </div>
                            {ruling.url && (
                              <a href={ruling.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs underline ml-2 flex-shrink-0">
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm text-slate-600">No CBP rulings available for this classification.</p>
                      </div>
                    )}
                    {uploadedFiles.length > 0 && uploadedFiles.map((file, idx) => (
                      <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-900">✓ {file.name} (uploaded)</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance Notes */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-900 text-sm mb-1"><strong>Customs Validation Notes:</strong></p>
                        <p className="text-amber-800 text-sm">
                          This classification has been determined in accordance with the Harmonized Tariff Schedule of the United States (HTSUS) and General Rules of Interpretation. 
                          CBP retains final authority over classification decisions. This reasoning document can be presented to customs officials during entry review or audit.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {!readOnly && (
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <label className="block text-slate-900 mb-2 text-sm">Classification Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Add any notes about this classification decision..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                />
              </div>
            )}
          </div>

          {/* Right Panel - AI Chat Assistant (hidden when readOnly) */}
          {!readOnly && (
          <div className="w-1/2 flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3>AI Classification Assistant</h3>
                  <p className="text-blue-100 text-sm">Ask questions or upload documents to improve classification</p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isLoadingHistory && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="text-sm text-slate-500">Loading conversation history...</span>
                </div>
              )}
              {chatMessages.map((message, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="flex-1 max-w-[85%]">
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-line">{message.text}</p>
                    </div>
                    {message.timestamp && (
                      <p className="text-xs text-slate-500 mt-1 px-2">{message.timestamp}</p>
                    )}
                  </div>
                </div>
              ))}
              {isSendingMessage && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      <span className="text-sm text-slate-500">Analyzing your input...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <div className="px-6 py-3 bg-white border-t border-slate-200 flex-shrink-0">
                <p className="text-xs text-slate-600 mb-2">Uploaded Documents:</p>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-900">{file.name}</span>
                      <button
                        onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Input */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex-shrink-0">
              <div className="flex gap-2 mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload Documents
                </button>
                <div className="text-xs text-slate-500 self-center">
                  Spec sheets, images, certificates
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isSendingMessage && handleSendMessage()}
                  placeholder={isSendingMessage ? "Waiting for response..." : "Ask about materials, primary function, certifications..."}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isSendingMessage}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                💡 Try asking: "What material details do you need?" or "How does this affect my duty rate?"
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 px-6 py-4 bg-white border-t border-slate-200 flex-shrink-0">
          {readOnly ? (
            <>
              <div className="flex-1 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Classification Approved
              </div>
              <button
                onClick={onClose}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleApprove}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <ThumbsUp className="w-5 h-5" />
                Approve Classification
              </button>
              <button
                onClick={onReject}
                className="px-6 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <ThumbsDown className="w-5 h-5" />
                Review Later
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}