import { useState, useRef } from 'react';
import { AlertCircle, CheckCircle, X, ArrowLeft, Sparkles, ThumbsUp, ThumbsDown, MessageSquare, Upload, FileText, Send, Lightbulb, Info, Plus } from 'lucide-react';

interface ExceptionReviewProps {
  product: {
    id: number;
    productName: string;
    description: string;
    hts: string;
    confidence: number;
    tariff: string;
    origin: string;
    reason: string;
  };
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  timestamp?: string;
}

export function ExceptionReview({ product, onClose, onApprove, onReject }: ExceptionReviewProps) {
  const [selectedHts, setSelectedHts] = useState(product.hts);
  const [notes, setNotes] = useState('');
  const [currentConfidence, setCurrentConfidence] = useState(product.confidence);
  const [previousConfidence, setPreviousConfidence] = useState(product.confidence);
  const [materialsProvided, setMaterialsProvided] = useState(false);
  const [primaryUseProvided, setPrimaryUseProvided] = useState(false);
  const [certificationProvided, setCertificationProvided] = useState(false);
  const [resolvedIssues, setResolvedIssues] = useState<string[]>([]);
  // Using available data: product.productName, product.confidence, product.hts from database
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: `I see you're reviewing "${product.productName}". I've flagged this with ${product.confidence}% confidence because of some ambiguity in the classification. Let me walk you through what I found and how we can resolve this together.`,
      timestamp: 'Just now'
    },
    {
      role: 'assistant',
      // HARDCODED: Chat message content - Should be dynamic based on product.reason or fetched from database
      // TODO: Make message content dynamic based on actual exception reason
      text: `The main challenge here is determining the product's primary function. I've suggested HTS ${product.hts}, but there are a few other possibilities depending on specific details. Feel free to ask me questions or upload any supporting documents you have!`,
      timestamp: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // HARDCODED: Alternate classifications - Should come from database field: user_product_classification_results.alternate_classifications (jsonb)
  // TODO: Fetch from database when alternate_classifications field is added
  const alternatives = [
    { 
      hts: '9102.11.0000', 
      confidence: 68, 
      description: 'Wrist watches, electrically operated, mechanical display only',
      tariff: '9.8%',
      reasoning: 'Product includes timekeeping as primary function'
    },
    { 
      hts: '9031.80.8000', 
      confidence: 62, 
      description: 'Measuring or checking instruments, appliances and machines',
      tariff: '1.7%',
      reasoning: 'Primary function is health monitoring and measurement'
    },
    {
      hts: '8517.62.0050',
      confidence: 58,
      description: 'Machines for reception, conversion, transmission of voice/data',
      tariff: '0% (Free)',
      reasoning: 'Device has wireless communication and data transmission capabilities'
    }
  ];

  // Filter out the proposed classification from alternatives
  const filteredAlternatives = alternatives.filter(alt => alt.hts !== product.hts);

  // HARDCODED: Confidence analysis issues - Should come from database or be dynamically generated based on product.reason
  // TODO: Generate dynamically based on product.reason or fetch from classification_issues table when created
  const confidenceAnalysis = {
    primaryIssues: [
      {
        issue: 'Unclear Primary Function',
        explanation: 'The product combines timekeeping (watch) with health monitoring features. HTS classification depends on which function is primary/predominant.',
        impact: 'high',
        resolved: primaryUseProvided
      },
      {
        issue: 'Multiple HTS Categories Apply',
        explanation: 'This device could legitimately fall under watches (9102), measuring instruments (9031), or communication devices (8517).',
        impact: 'high',
        resolved: primaryUseProvided
      },
      {
        issue: 'Insufficient Material Information',
        explanation: 'Missing details about case material, strap material, and component breakdown affects precise classification.',
        impact: 'medium',
        resolved: materialsProvided
      },
      {
        issue: 'Certification Status Unknown',
        explanation: 'Medical device certification (FDA, CE) significantly impacts classification and duty rates.',
        impact: 'medium',
        resolved: certificationProvided
      }
    ],
    suggestedActions: [
      'Clarify primary intended use: Is it marketed primarily as a watch or health monitor?',
      'Provide material breakdown (case, strap, internal components)',
      'Specify if health monitoring is medically certified or recreational',
      'Upload product specification sheet or marketing materials'
    ]
  };

  const updateConfidenceScore = (newIssuesResolved: string[]) => {
    let confidenceBoost = 0;
    const newlyResolved = newIssuesResolved.filter(issue => !resolvedIssues.includes(issue));
    
    // HARDCODED: Confidence boost values - Should be configurable or based on issue severity from database
    // TODO: Make configurable or fetch from database when classification_issues table is created
    newlyResolved.forEach(issue => {
      if (issue === 'primary_use') confidenceBoost += 12;
      if (issue === 'materials') confidenceBoost += 8;
      if (issue === 'certification') confidenceBoost += 9;
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

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      text: chatInput,
      timestamp: 'Just now'
    };

    setChatMessages(prev => [...prev, userMessage]);

    // Analyze user input for information provided
    const lowerInput = chatInput.toLowerCase();
    const newIssuesResolved: string[] = [];
    
    // Detect primary use information
    if ((lowerInput.includes('health') || lowerInput.includes('fitness') || lowerInput.includes('monitor') || lowerInput.includes('track')) && 
        (lowerInput.includes('primary') || lowerInput.includes('main') || lowerInput.includes('marketed'))) {
      if (!primaryUseProvided) {
        setPrimaryUseProvided(true);
        newIssuesResolved.push('primary_use');
      }
    }
    
    // Detect material information - simplified logic
    const hasMaterialKeyword = lowerInput.includes('material') || lowerInput.includes('made') || 
                                lowerInput.includes('composition') || lowerInput.includes('fabric');
    const hasMaterialType = lowerInput.includes('cotton') || lowerInput.includes('polyester') || 
                           lowerInput.includes('wool') || lowerInput.includes('nylon') || 
                           lowerInput.includes('leather') || lowerInput.includes('rubber') ||
                           lowerInput.includes('aluminum') || lowerInput.includes('steel') || 
                           lowerInput.includes('plastic') || lowerInput.includes('silicone') || 
                           lowerInput.includes('metal');
    const hasPercentage = lowerInput.match(/\d+\s*%/);
    
    // Trigger if has material keyword + type, OR has percentage (material composition)
    if (!materialsProvided && ((hasMaterialKeyword && hasMaterialType) || hasPercentage)) {
      setMaterialsProvided(true);
      newIssuesResolved.push('materials');
    }
    
    // Detect certification information
    if (lowerInput.includes('fda') || lowerInput.includes('ce mark') || lowerInput.includes('certified') || 
        lowerInput.includes('class ii') || lowerInput.includes('medical device')) {
      if (!certificationProvided) {
        setCertificationProvided(true);
        newIssuesResolved.push('certification');
      }
    }

    // Update confidence score BEFORE the AI response
    if (newIssuesResolved.length > 0) {
      updateConfidenceScore(newIssuesResolved);
    }

    // HARDCODED: AI response templates - Should use actual AI service or be dynamic based on product context
    // TODO: Integrate with AI service or make responses dynamic based on product data
    setTimeout(() => {
      let aiResponse = '';
      
      if (lowerInput.includes('primary function') || lowerInput.includes('main use')) {
        aiResponse = "Perfect question! The 'essential character' or primary function is the key to getting this right. If the product is marketed mainly as a fitness/health tracker that happens to tell time, we'd classify it under measuring instruments (9031.80.8000) at 1.7% duty. If it's sold as a watch with health features, it stays under 9102.11.0000 at 9.8% duty. What does your marketing say?";
      } else if (lowerInput.includes('material') || lowerInput.includes('made of') || hasPercentage) {
        aiResponse = "Good thinking! Material details will help me nail this down. For watches, the case material directly affects the HTS subcategory:\n• Aluminum/base metal case → different rate\n• Precious metal content → much higher duty\n\nCan you tell me the case material and strap type? Or upload the spec sheet?";
      } else if (lowerInput.includes('medical') || lowerInput.includes('fda') || lowerInput.includes('certified')) {
        aiResponse = "This is a game-changer! Medical certification shifts the classification significantly. If you have FDA registration or CE medical device certification, it strengthens the case for 9031.80.8000 (measuring instruments) at 1.7% instead of 9.8%. Some medical devices even qualify for duty-free treatment. Do you have certification documents you can share?";
      } else if (lowerInput.includes('tariff') || lowerInput.includes('duty') || lowerInput.includes('rate') || lowerInput.includes('save') || lowerInput.includes('cost')) {
        // HARDCODED: Tariff comparison - Should use actual tariff rates from database or alternatives data
        // TODO: Use actual tariff rates from product.tariff and alternatives data
        aiResponse = `Let me break down the financial impact for you:\n\n📊 HTS 9102.11.0000 (Watches): 9.8% duty\n📊 HTS 9031.80.8000 (Instruments): 1.7% duty\n📊 HTS 8517.62.0050 (Comm devices): 0% duty\n\nIf your shipment value is $11,250, that's a difference of $920 vs $191 vs $0 in duties. Getting this classification right really matters for your bottom line!`;
      } else if (lowerInput.includes('help') || lowerInput.includes('what do you need') || lowerInput.includes('how can')) {
        aiResponse = "I'm here to help! Here's what would help me increase the confidence score:\n\n1. Product specs or data sheet\n2. How it's marketed (watch vs health device)\n3. Material composition details\n4. Any certifications (FDA, CE, etc.)\n\nYou can either type the details or upload documents using the button below. What works best for you?";
      } else {
        aiResponse = "I want to help you get this right! Based on what you're asking, I think more specific product details would really help. You can:\n\n• Upload the product specification sheet\n• Share marketing materials\n• Tell me about certifications\n• Describe the primary use case\n\nWhich of these is easiest for you to provide?";
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: aiResponse,
        timestamp: 'Just now'
      };

      setChatMessages(prev => [...prev, assistantMessage]);
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 800);

    setChatInput('');
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

      // HARDCODED: Document analysis response - Should use actual document content analysis or AI processing
      // TODO: Implement actual document analysis or integrate with AI service
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: `Excellent! I've analyzed the document${files.length > 1 ? 's' : ''} and found some key details:\n\n✅ Product marketed as "Smart Health Watch"\n✅ Case: Aluminum alloy (base metal, not precious)\n✅ Primary features: Heart rate, SpO2, sleep tracking (FDA registered Class II)\n✅ Timekeeping listed as secondary/convenience feature\n\nThis evidence strongly supports classifying under 9031.80.8000 (Measuring instruments) rather than 9102 (Watches):\n• Duty drops from 9.8% → 1.7%\n• Classification now has high confidence!\n• Saves you approximately $729 on this shipment\n\nWould you like me to update the recommended classification?`,
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
    onApprove();
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
              <h2 className="text-slate-900">Low Confidence Classification Review</h2>
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
          <div className="w-1/2 border-r border-slate-200 overflow-y-auto p-6 space-y-6">
            {/* Exception Alert */}
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

            {/* AI Confidence Analysis */}
            <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-200">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h3 className="text-slate-900">AI Analysis</h3>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
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
                  {/* HARDCODED: HTS description - Should come from database field: user_product_classification_results.hts_description or hts_code_lookup table */}
                  {/* TODO: Fetch from database when hts_description field is added or use hts_code_lookup table */}
                  <div className="text-slate-700 text-xs mb-2 flex items-center gap-2">
                    <span>Wrist watches, electrically operated, mechanical display only</span>
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
                  </div>
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

                {/* HARDCODED: Classification hierarchy - Should come from hts_code_lookup table (chapter, heading, subheading) */}
                {/* TODO: Fetch from hts_code_lookup table when created, or from database field if added */}
                <div className="pt-3 border-t border-slate-200">
                  <div className="text-slate-900 text-sm mb-2 flex items-center gap-2">
                    <span>Classification Hierarchy</span>
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-600 min-w-[80px]">Chapter</span>
                      <span className="text-slate-700">91 — Clocks and watches and parts thereof</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-slate-600 min-w-[80px]">Heading</span>
                      <span className="text-slate-700">9102 — Wrist watches, pocket watches and other watches</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-slate-600 min-w-[80px]">Subheading</span>
                      <span className="text-slate-700">9102.21 — With automatic winding</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Alternative Classifications */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-slate-900">Alternative Classifications</h3>
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
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
                        
                        {/* HARDCODED: Alternative classification hierarchy - Should come from hts_code_lookup table or alternate_classifications data */}
                        {/* TODO: Fetch from database when alternate_classifications includes hierarchy or use hts_code_lookup table */}
                        <div className="space-y-1 text-xs mb-2">
                          <div className="mb-1">
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-slate-600 min-w-[55px]">Chapter</span>
                            <span className="text-slate-700">{index === 0 ? '91 — Clocks and watches' : index === 1 ? '90 — Optical, measuring, checking instruments' : '85 — Electrical machinery'}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-slate-600 min-w-[55px]">Heading</span>
                            <span className="text-slate-700">{index === 0 ? '9102 — Wrist watches' : index === 1 ? '9031 — Measuring instruments' : '8517 — Telephone sets'}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-slate-600 min-w-[55px]">Subheading</span>
                            <span className="text-slate-700">{index === 0 ? '9102.11 — Wrist watches, mechanical display' : index === 1 ? '9031.80 — Measuring instruments' : '8517.62 — Voice/data transmission'}</span>
                          </div>
                        </div>
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
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
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
                  {/* HARDCODED: Classification decision reasoning - Should come from database field: user_product_classification_results.reasoning */}
                  {/* TODO: Fetch from database when reasoning field is added */}
                  <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                    <p className="text-slate-700 text-sm mb-3">
                      <strong>HTS Code {selectedHts}</strong> was selected based on the product's primary function, material composition, and physical characteristics.
                    </p>
                    <p className="text-slate-600 text-sm">
                      This classification aligns with the Harmonized Tariff Schedule of the United States (HTSUS) Chapter {selectedHts.substring(0, 2)} which covers: 
                      {selectedHts.startsWith('91') && ' Clocks and watches and parts thereof.'}
                      {selectedHts.startsWith('90') && ' Optical, photographic, measuring, checking, precision, medical or surgical instruments and apparatus.'}
                      {selectedHts.startsWith('85') && ' Electrical machinery and equipment and parts thereof.'}
                    </p>
                  </div>
                </div>

                {/* HARDCODED: General Rules of Interpretation - Should come from database field: user_product_classification_results.reasoning or be dynamically generated */}
                {/* TODO: Generate dynamically or fetch from database when reasoning field includes GRI analysis */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">2</div>
                    <h4 className="text-slate-900">General Rules of Interpretation (GRI)</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-green-900"><strong>GRI 1:</strong> Classification determined by terms of the headings</p>
                          <p className="text-xs text-green-700 mt-1">Product description matches the heading terminology for HTS {selectedHts}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-green-900"><strong>GRI 3(a):</strong> Most specific description prevails</p>
                          <p className="text-xs text-green-700 mt-1">The selected subheading provides the most specific description of the product</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

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
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded border border-red-300">HARDCODED</span>
                  </div>
                  {/* HARDCODED: Supporting documentation list - Should come from database table: user_product_documents */}
                  {/* TODO: Fetch actual documents from user_product_documents table for this product */}
                  <div className="ml-8 space-y-2">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">✓ Product specification sheet</p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">✓ Material composition details</p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">✓ Country of origin documentation</p>
                    </div>
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
          </div>

          {/* Right Panel - AI Chat Assistant */}
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
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about materials, primary function, certifications..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                💡 Try asking: "What material details do you need?" or "How does this affect my duty rate?"
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 px-6 py-4 bg-white border-t border-slate-200 flex-shrink-0">
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
        </div>
      </div>
    </div>
  );
}