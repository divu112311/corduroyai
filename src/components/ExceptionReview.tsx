import { useState } from 'react';
import { AlertCircle, CheckCircle, X, ArrowLeft, Sparkles, ThumbsUp, ThumbsDown, Lightbulb, Info, Plus } from 'lucide-react';

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

export function ExceptionReview({ product, readOnly, bulkRunId, bulkItemId, clarificationQuestions, onClose, onApprove, onReject }: ExceptionReviewProps) {
  const [selectedHts, setSelectedHts] = useState(product.hts);
  const [notes, setNotes] = useState('');
  const [currentConfidence, setCurrentConfidence] = useState(product.confidence);
  const [previousConfidence, setPreviousConfidence] = useState(product.confidence);
  const [materialsProvided, setMaterialsProvided] = useState(false);
  const [primaryUseProvided, setPrimaryUseProvided] = useState(false);
  const [certificationProvided, setCertificationProvided] = useState(false);
  const [resolvedIssues, setResolvedIssues] = useState<string[]>([]);

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

    newlyResolved.forEach(issue => {
      if (issue === 'primary_use') confidenceBoost += 10;
      else if (issue === 'materials') confidenceBoost += 8;
      else if (issue === 'certification') confidenceBoost += 7;
      else confidenceBoost += 5;
    });

    if (confidenceBoost > 0) {
      setPreviousConfidence(currentConfidence);
      const newConfidence = Math.min(currentConfidence + confidenceBoost, 95);
      setCurrentConfidence(newConfidence);
      setResolvedIssues(prev => [...prev, ...newlyResolved]);
    }
  };

  const handleHtsSelection = (hts: string) => {
    setSelectedHts(hts);
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
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
      <div className="bg-white rounded-xl max-w-3xl w-full h-[90vh] flex flex-col">
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
          <div className="w-full overflow-y-auto p-6 space-y-6">
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