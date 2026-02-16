import { useState } from 'react';
import { CheckCircle, Package, MapPin, DollarSign, FileText, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Shield, XCircle, Info, Activity } from 'lucide-react';

export interface CbpRuling {
  ruling_number: string;
  ruling_date: string;
  subject: string;
  url: string;
  hs_codes?: string[];
}

export interface RuleVerification {
  status: string;
  checks_passed: string[];
  checks_failed: string[];
  missing_info: string[];
  reasoning: string;
  gri_applied: string[];
  applicable_notes: string[];
}

export interface ClassificationResultData {
  hts: string;
  confidence: number;
  description: string;
  tariff_rate?: number;
  tariff_amount?: number;
  total_cost?: number;
  alternate_classification?: string;
  chapter_code?: string;
  chapter_title?: string;
  section_code?: string;
  section_title?: string;
  rule_verification?: RuleVerification;
  rule_confidence?: number;
  similarity_score?: number;
  classification_trace?: string;
  alternate_classifications?: Array<{
    hts: string;
    description: string;
    confidence: number;
    cbp_rulings?: CbpRuling[];
    chapter_code?: string;
    chapter_title?: string;
    section_code?: string;
    section_title?: string;
    rationale?: string;
    rule_verification?: RuleVerification;
  }>;
  cbp_rulings?: CbpRuling[];
  reasoning?: string;
  rulings?: any;
  parsed_data?: {
    product_name?: string;
    product_description?: string;
    country_of_origin?: string;
    materials?: any;
    unit_cost?: number;
    vendor?: string;
  };
}

interface ClassificationResultsProps {
  result: ClassificationResultData;
  onApprove?: () => void;
  onReviewLater?: () => void;
}

export function ClassificationResults({ result, onApprove, onReviewLater }: ClassificationResultsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedAlternates, setExpandedAlternates] = useState<Set<number>>(new Set());
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-slate-200 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600 rounded-lg">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-slate-900 font-semibold">Classification Complete</h3>
              <p className="text-slate-600 text-sm">HTS code and rulings have been generated</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              result.confidence >= 95 
                ? 'bg-green-100 text-green-700' 
                : result.confidence >= 85 
                ? 'bg-amber-100 text-amber-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {result.confidence}% Confidence
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* HTS Classification */}
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-green-900 font-semibold text-lg">HTS Classification</h4>
            <div className="text-green-700 text-sm">Primary Classification</div>
          </div>
          <div className="text-green-800 text-2xl font-mono mb-2">{result.hts}</div>
          
          <p className="text-green-700 text-sm mb-4">{result.description}</p>

          {/* Hierarchy Information */}
          {(result.section_title || result.chapter_title) && (
            <div className="flex flex-col gap-1 mb-3">
              {result.section_title && (
                <div className="flex items-center gap-2 text-xs font-medium text-green-700 uppercase tracking-wider">
                  <span className="bg-green-200 px-1.5 py-0.5 rounded">Section {result.section_code}</span>
                  <span>{result.section_title}</span>
                </div>
              )}
              {result.chapter_title && (
                <div className="flex items-center gap-2 text-xs font-medium text-green-700 uppercase tracking-wider">
                  <span className="bg-green-200 px-1.5 py-0.5 rounded">Chapter {result.chapter_code}</span>
                  <span>{result.chapter_title}</span>
                </div>
              )}
            </div>
          )}

          
          {/* CBP Rulings for Primary HTS Code */}
          {result.cbp_rulings && result.cbp_rulings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-green-200">
              <h5 className="text-green-900 font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                CBP Rulings ({result.cbp_rulings.length})
              </h5>
              <div className="space-y-3">
                {result.cbp_rulings.map((ruling, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-4 border border-green-200">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-green-900 font-semibold text-sm">{ruling.ruling_number}</span>
                          {ruling.ruling_date && (
                            <span className="text-green-600 text-xs">
                              {new Date(ruling.ruling_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <p className="text-green-800 text-sm font-medium mb-2">{ruling.subject}</p>
                        {ruling.hs_codes && ruling.hs_codes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {ruling.hs_codes.map((code, codeIdx) => (
                              <span key={codeIdx} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-mono rounded">
                                {code}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {ruling.url && (
                        <a
                          href={ruling.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                          title="View ruling on CBP website"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result.tariff_rate !== null && result.tariff_rate !== undefined && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-200">
              <div>
                <div className="text-green-600 text-xs mb-1">Tariff Rate</div>
                <div className="text-green-900 font-semibold">
                  {(result.tariff_rate * 100).toFixed(2)}%
                </div>
              </div>
              {result.tariff_amount !== null && result.tariff_amount !== undefined && (
                <div>
                  <div className="text-green-600 text-xs mb-1">Tariff Amount</div>
                  <div className="text-green-900 font-semibold">
                    ${result.tariff_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              {result.total_cost !== null && result.total_cost !== undefined && (
                <div>
                  <div className="text-green-600 text-xs mb-1">Total Cost</div>
                  <div className="text-green-900 font-semibold">
                    ${result.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rule Verification */}
        {result.rule_verification && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h4 className="text-indigo-900 font-semibold">Rule Verification</h4>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                result.rule_verification.status === 'verified' 
                  ? 'bg-green-100 text-green-700'
                  : result.rule_verification.status === 'excluded'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {result.rule_verification.status}
              </span>
            </div>

            {/* GRI Badges */}
            {result.rule_verification.gri_applied && result.rule_verification.gri_applied.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {result.rule_verification.gri_applied.map((gri, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200">
                    {gri}
                  </span>
                ))}
              </div>
            )}

            {/* Checks Passed */}
            {result.rule_verification.checks_passed && result.rule_verification.checks_passed.length > 0 && (
              <div className="mb-2">
                {result.rule_verification.checks_passed.map((check, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-green-700 mb-1">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{check}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Checks Failed */}
            {result.rule_verification.checks_failed && result.rule_verification.checks_failed.length > 0 && (
              <div className="mb-2">
                {result.rule_verification.checks_failed.map((check, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-red-700 mb-1">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{check}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Missing Info */}
            {result.rule_verification.missing_info && result.rule_verification.missing_info.length > 0 && (
              <div className="mb-2">
                {result.rule_verification.missing_info.map((info, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-amber-700 mb-1">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{info}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Reasoning */}
            {result.rule_verification.reasoning && (
              <p className="text-indigo-800 text-sm mt-2 pt-2 border-t border-indigo-200">
                {result.rule_verification.reasoning}
              </p>
            )}

            {/* Confidence Breakdown */}
            {result.rule_confidence !== undefined && (
              <div className="mt-3 pt-3 border-t border-indigo-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-indigo-700 font-medium flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Rule Confidence
                  </span>
                  <span className="text-indigo-900 font-semibold">{Math.round(result.rule_confidence * 100)}%</span>
                </div>
                {result.similarity_score !== undefined && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-indigo-600">Similarity Score</span>
                    <span className="text-indigo-800">{Math.round(result.similarity_score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Classification Trace */}
        {result.classification_trace && (
          <div className="border border-slate-200 rounded-lg">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
            >
              <h4 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                Classification Trace
              </h4>
              {showTrace ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {showTrace && (
              <div className="px-4 pb-4">
                <pre className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
                  {result.classification_trace}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Parsed Data */}
        {result.parsed_data && (
          <div className="border border-slate-200 rounded-lg p-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between text-left"
            >
              <h4 className="text-slate-900 font-semibold">Parsed Product Information</h4>
              {showDetails ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
            
            {showDetails && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {result.parsed_data.product_name && (
                  <div>
                    <div className="text-slate-600 mb-1">Product Name</div>
                    <div className="text-slate-900">{result.parsed_data.product_name}</div>
                  </div>
                )}
                {result.parsed_data.country_of_origin && (
                  <div>
                    <div className="text-slate-600 mb-1">Country of Origin</div>
                    <div className="text-slate-900">{result.parsed_data.country_of_origin}</div>
                  </div>
                )}
                {result.parsed_data.product_description && (
                  <div className="col-span-2">
                    <div className="text-slate-600 mb-1">Description</div>
                    <div className="text-slate-900">{result.parsed_data.product_description}</div>
                  </div>
                )}
                {result.parsed_data.materials && (
                  <div className="col-span-2">
                    <div className="text-slate-600 mb-1">Materials</div>
                    <div className="text-slate-900">
                      {typeof result.parsed_data.materials === 'string' 
                        ? result.parsed_data.materials 
                        : JSON.stringify(result.parsed_data.materials)}
                    </div>
                  </div>
                )}
                {result.parsed_data.unit_cost !== null && result.parsed_data.unit_cost !== undefined && (
                  <div>
                    <div className="text-slate-600 mb-1">Unit Cost</div>
                    <div className="text-slate-900">
                      ${result.parsed_data.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )}
                {result.parsed_data.vendor && (
                  <div>
                    <div className="text-slate-600 mb-1">Vendor</div>
                    <div className="text-slate-900">{result.parsed_data.vendor}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reasoning */}
        {result.reasoning && (
          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-slate-900 font-semibold mb-2">Classification Reasoning</h4>
            <p className="text-slate-700 text-sm whitespace-pre-wrap">{result.reasoning}</p>
          </div>
        )}

        {/* Alternate Classifications */}
        {(result.alternate_classifications && result.alternate_classifications.length > 0) || result.alternate_classification ? (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h4 className="text-amber-900 font-semibold">
                {result.alternate_classifications && result.alternate_classifications.length > 1 
                  ? 'Alternate Classifications' 
                  : 'Alternate Classification'}
              </h4>
            </div>
            {result.alternate_classifications && result.alternate_classifications.length > 0 ? (
              <div className="space-y-3">
                {result.alternate_classifications.map((alt, index) => {
                  const isExpanded = expandedAlternates.has(index);
                  const hasRulings = alt.cbp_rulings && alt.cbp_rulings.length > 0;
                  
                  return (
                    <div
                      key={index}
                      className="bg-white rounded-lg border border-amber-200 cursor-pointer"
                      onClick={() => {
                        const newExpanded = new Set(expandedAlternates);
                        if (isExpanded) {
                          newExpanded.delete(index);
                        } else {
                          newExpanded.add(index);
                        }
                        setExpandedAlternates(newExpanded);
                      }}
                    >
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-amber-800 font-mono font-semibold">{alt.hts}</div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              alt.confidence >= 85 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-amber-50 text-amber-600'
                            }`}>
                              {alt.confidence}% Confidence
                            </span>
                            <span className="p-1 text-amber-600">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </span>
                          </div>
                        </div>
                        <p className="text-amber-700 text-sm">{alt.description}</p>
                        <div className="mt-2 text-xs text-amber-600">
                          {hasRulings
                            ? `${alt.cbp_rulings!.length} ruling${alt.cbp_rulings!.length !== 1 ? 's' : ''} available`
                            : 'No rulings available'}
                        </div>
                      </div>
                      
                      {/* Expandable Details Section */}
                      {isExpanded && (
                        <div className="border-t border-amber-200 bg-amber-25 p-4">
                          {hasRulings && (
                            <>
                              <h6 className="text-amber-900 font-semibold mb-3 flex items-center gap-2 text-sm">
                                <FileText className="w-4 h-4" />
                                CBP Rulings ({alt.cbp_rulings!.length})
                              </h6>
                              <div className="space-y-3">
                                {alt.cbp_rulings!.map((ruling, rulingIdx) => (
                                  <div key={rulingIdx} className="bg-white rounded-lg p-3 border border-amber-200">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-amber-900 font-semibold text-sm">{ruling.ruling_number}</span>
                                          {ruling.ruling_date && (
                                            <span className="text-amber-600 text-xs">
                                              {new Date(ruling.ruling_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-amber-800 text-sm font-medium mb-2">{ruling.subject}</p>
                                        {ruling.hs_codes && ruling.hs_codes.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mb-2">
                                            {ruling.hs_codes.map((code, codeIdx) => (
                                              <span key={codeIdx} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-mono rounded">
                                                {code}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      {ruling.url && (
                                        <a
                                          href={ruling.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-2 p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                                          title="View ruling on CBP website"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : result.alternate_classification ? (
              <div className="text-amber-800 font-mono">{result.alternate_classification}</div>
            ) : null}
          </div>
        ) : null}

        {/* Rulings */}
        {result.rulings && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
            <h4 className="text-blue-900 font-semibold mb-3">Relevant Rulings & Documentation</h4>
            <div className="text-blue-800 text-sm">
              {typeof result.rulings === 'string' 
                ? result.rulings 
                : JSON.stringify(result.rulings, null, 2)}
            </div>
          </div>
        )}

        {/* Actions */}
        {(onApprove || onReviewLater) && (
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            {onApprove && (
              <button
                onClick={onApprove}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Approve & Save
              </button>
            )}
            {onReviewLater && (
              <button
                onClick={onReviewLater}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Review Later
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

