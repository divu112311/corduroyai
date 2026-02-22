import { X, Package, MapPin, DollarSign, FileText, Calendar, CheckCircle, AlertCircle, Download, ExternalLink, Shield, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ProductDetailsModalProps {
  product: any;
  onClose: () => void;
  onEdit?: () => void;
}

interface Document {
  id: number;
  document_type: string;
  file_name: string;
  file_type: string;
  file_url: string;
  uploaded_at: string;
}

export function ProductDetailsModal({ product, onClose }: ProductDetailsModalProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [expandedAlternates, setExpandedAlternates] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!product?.productId) {
        setIsLoadingDocs(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoadingDocs(false);
          return;
        }

        const { data: docs, error } = await supabase
          .from('user_product_documents')
          .select('id, document_type, file_name, file_type, file_url, uploaded_at')
          .eq('product_id', product.productId)
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false });

        if (error) {
          console.error('Error fetching documents:', error);
          setDocuments([]);
        } else {
          setDocuments(docs || []);
        }
      } catch (error) {
        console.error('Error fetching documents:', error);
        setDocuments([]);
      } finally {
        setIsLoadingDocs(false);
      }
    };

    fetchDocuments();
  }, [product?.productId]);

  const handleExportPDF = () => {
    window.print();
  };

  const handleViewHTSUS = () => {
    const htsCode = product.hts.replace(/\./g, '');
    window.open(`https://hts.usitc.gov/?query=${htsCode}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-none md:rounded-xl w-full h-full md:max-w-4xl md:w-full md:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-slate-900">{product.name}</h2>
            <p className="text-slate-600 text-sm">SKU: {product.sku}</p>
            {product.description && (
              <p className="text-slate-500 text-xs mt-1">{product.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Classification Card */}
          <div className="mb-6 p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="text-green-900 text-sm mb-2">Current Classification</div>
                <div className="text-green-800 text-lg mb-3 flex items-center gap-2">
                  <span>HTS Code: {product.hts}</span>
                </div>

                {/* Hierarchy from DB */}
                {(product.sectionCode || product.chapterCode) && (
                  <div className="space-y-1 text-xs mb-3">
                    {product.sectionCode && (
                      <div className="flex items-center gap-2">
                        <span className="bg-green-200 px-1.5 py-0.5 rounded text-green-700 font-medium">Section {product.sectionCode}</span>
                        {product.sectionTitle && <span className="text-green-800">{product.sectionTitle}</span>}
                      </div>
                    )}
                    {product.chapterCode && (
                      <div className="flex items-center gap-2">
                        <span className="bg-green-200 px-1.5 py-0.5 rounded text-green-700 font-medium">Chapter {product.chapterCode}</span>
                        {product.chapterTitle && <span className="text-green-800">{product.chapterTitle}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* CBP Rulings */}
                {product.cbpRulings && product.cbpRulings.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <h5 className="text-green-900 font-semibold mb-3 flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4" />
                      CBP Rulings ({product.cbpRulings.length})
                    </h5>
                    <div className="space-y-2">
                      {product.cbpRulings.map((ruling: any, idx: number) => (
                        <div key={idx} className="bg-white rounded-lg p-3 border border-green-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-green-900 font-semibold text-sm">{ruling.ruling_number}</span>
                                {ruling.ruling_date && (
                                  <span className="text-green-600 text-xs">
                                    {new Date(ruling.ruling_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              <p className="text-green-800 text-sm">{ruling.subject}</p>
                              {ruling.hs_codes && ruling.hs_codes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {ruling.hs_codes.map((code: string, codeIdx: number) => (
                                    <span key={codeIdx} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-mono rounded">{code}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {ruling.url && (
                              <a href={ruling.url} target="_blank" rel="noopener noreferrer" className="ml-2 p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tariff Info */}
                {product.tariffRate !== null && product.tariffRate !== undefined && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-200 mt-4">
                    <div>
                      <div className="text-green-600 text-xs mb-1">Tariff Rate</div>
                      <div className="text-green-900 font-semibold">{(product.tariffRate * 100).toFixed(2)}%</div>
                    </div>
                    {product.tariffAmount !== null && product.tariffAmount !== undefined && (
                      <div>
                        <div className="text-green-600 text-xs mb-1">Tariff Amount</div>
                        <div className="text-green-900 font-semibold">${product.tariffAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                    {product.totalCost !== null && product.totalCost !== undefined && (
                      <div>
                        <div className="text-green-600 text-xs mb-1">Total Cost</div>
                        <div className="text-green-900 font-semibold">${product.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg self-start">
                <CheckCircle className="w-5 h-5 text-green-700" />
                <span className="text-green-900">{product.confidence}% Confidence</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Calendar className="w-4 h-4" />
              <span>Last updated: {new Date(product.lastUpdated).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</span>
            </div>
          </div>

          {/* Rule Verification */}
          {product.ruleVerification && (
            <div className="mb-6 border border-indigo-200 bg-indigo-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h3 className="text-indigo-900 font-semibold">Rule Verification</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  product.ruleVerification.status === 'verified'
                    ? 'bg-green-100 text-green-700'
                    : product.ruleVerification.status === 'excluded'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {product.ruleVerification.status}
                </span>
              </div>

              {product.ruleVerification.gri_applied?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {product.ruleVerification.gri_applied.map((gri: string, idx: number) => (
                    <span key={idx} className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200">{gri}</span>
                  ))}
                </div>
              )}

              {product.ruleVerification.checks_passed?.length > 0 && (
                <div className="mb-2">
                  {product.ruleVerification.checks_passed.map((check: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-green-700 mb-1">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              )}

              {product.ruleVerification.checks_failed?.length > 0 && (
                <div className="mb-2">
                  {product.ruleVerification.checks_failed.map((check: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-red-700 mb-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              )}

              {product.ruleVerification.missing_info?.length > 0 && (
                <div className="mb-2">
                  {product.ruleVerification.missing_info.map((info: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-amber-700 mb-1">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{info}</span>
                    </div>
                  ))}
                </div>
              )}

              {product.ruleVerification.reasoning && (
                <p className="text-indigo-800 text-sm mt-2 pt-2 border-t border-indigo-200">
                  {product.ruleVerification.reasoning}
                </p>
              )}

              {product.ruleConfidence !== undefined && product.ruleConfidence !== null && (
                <div className="mt-3 pt-3 border-t border-indigo-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-indigo-700 font-medium">Rule Confidence</span>
                    <span className="text-indigo-900 font-semibold">{Math.round(product.ruleConfidence * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product Information Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <Package className="w-5 h-5" />
                <span>Materials & Composition</span>
              </div>
              <p className="text-slate-900 text-sm">{product.materials}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <MapPin className="w-5 h-5" />
                <span>Country of Origin</span>
              </div>
              <p className="text-slate-900 text-sm">{product.origin}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <DollarSign className="w-5 h-5" />
                <span>Unit Cost</span>
              </div>
              <p className="text-slate-900 text-sm">{product.cost}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <FileText className="w-5 h-5" />
                <span>Vendor</span>
              </div>
              <p className="text-slate-900 text-sm">{product.vendor}</p>
            </div>
          </div>

          {/* Classification Reasoning */}
          {product.reasoning && (
            <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-3 border-b border-indigo-100">
                <h3 className="text-indigo-900">Classification Reasoning</h3>
                <p className="text-indigo-700 text-sm">Detailed justification for HTS {product.hts}</p>
              </div>
              <div className="p-5 bg-white">
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{product.reasoning}</p>
              </div>
            </div>
          )}


          {/* Alternate Classifications */}
          {product.alternateClassifications && product.alternateClassifications.length > 0 && (
            <div className="mb-6 border border-amber-200 bg-amber-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h3 className="text-amber-900 font-semibold">Alternate Classifications</h3>
              </div>
              <div className="space-y-3">
                {product.alternateClassifications.map((alt: any, index: number) => {
                  const isExpanded = expandedAlternates.has(index);
                  const hasRulings = alt.cbp_rulings && alt.cbp_rulings.length > 0;

                  return (
                    <div key={index} className="bg-white rounded-lg border border-amber-200 cursor-pointer"
                      onClick={() => {
                        const newExpanded = new Set(expandedAlternates);
                        if (isExpanded) newExpanded.delete(index);
                        else newExpanded.add(index);
                        setExpandedAlternates(newExpanded);
                      }}
                    >
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-amber-800 font-mono font-semibold">{alt.hts}</div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              alt.confidence >= 85 ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-600'
                            }`}>
                              {alt.confidence}% Confidence
                            </span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
                          </div>
                        </div>
                        <p className="text-amber-700 text-sm">{alt.description}</p>
                        {alt.rationale && <p className="text-amber-600 text-xs mt-1">{alt.rationale}</p>}
                        <div className="mt-2 text-xs text-amber-600">
                          {hasRulings ? `${alt.cbp_rulings.length} ruling${alt.cbp_rulings.length !== 1 ? 's' : ''} available` : 'No rulings available'}
                        </div>
                      </div>

                      {isExpanded && hasRulings && (
                        <div className="border-t border-amber-200 p-4">
                          <h6 className="text-amber-900 font-semibold mb-3 flex items-center gap-2 text-sm">
                            <FileText className="w-4 h-4" />
                            CBP Rulings ({alt.cbp_rulings.length})
                          </h6>
                          <div className="space-y-2">
                            {alt.cbp_rulings.map((ruling: any, rulingIdx: number) => (
                              <div key={rulingIdx} className="bg-white rounded-lg p-3 border border-amber-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-amber-900 font-semibold text-sm">{ruling.ruling_number}</span>
                                      {ruling.ruling_date && (
                                        <span className="text-amber-600 text-xs">
                                          {new Date(ruling.ruling_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-amber-800 text-sm">{ruling.subject}</p>
                                    {ruling.hs_codes && ruling.hs_codes.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {ruling.hs_codes.map((code: string, codeIdx: number) => (
                                          <span key={codeIdx} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-mono rounded">{code}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {ruling.url && (
                                    <a href={ruling.url} target="_blank" rel="noopener noreferrer" className="ml-2 p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                                      onClick={(e) => e.stopPropagation()}>
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Supporting Documentation */}
          <div className="mb-6">
            <h3 className="text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-600" />
              Supporting Documentation
            </h3>
            {isLoadingDocs ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm text-slate-600">Loading documents...</p>
              </div>
            ) : documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-900 font-medium">{doc.file_name}</p>
                        <p className="text-xs text-blue-700 mt-1">
                          {doc.document_type} • {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="ml-2 p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm text-slate-600">No documents uploaded for this product</p>
              </div>
            )}
          </div>

          {/* Compliance Notes */}
          <div className="mb-6">
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

          {/* Export Options */}
          <div className="flex gap-3">
            <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm" onClick={handleExportPDF}>
              <Download className="w-4 h-4" />
              Export as PDF
            </button>
            <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm" onClick={handleViewHTSUS}>
              <ExternalLink className="w-4 h-4" />
              View HTSUS Reference
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
