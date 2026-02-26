import { useState, useEffect } from 'react';
import { X, ArrowLeft, CheckCircle, AlertCircle, FileText, Calendar, Loader, ThumbsUp, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as classificationService from '../lib/classificationService';

interface ClassificationResult {
  hts_classification: string;
  confidence: number;
  description: string;
  reasoning: string;
  tariff_rate?: number;
  chapter_code?: string;
  chapter_title?: string;
  section_code?: string;
  section_title?: string;
  cbp_rulings?: any;
  alternate_classifications?: any;
}

interface BulkItemDetailProps {
  item: {
    id: number | string;
    productName: string;
    description: string;
    status: 'pending' | 'complete' | 'exception';
    hts?: string;
    confidence?: number;
    tariff?: string;
    origin?: string;
    materials?: string;
    cost?: string;
    bulkItemId?: string;
    clarificationQuestions?: Array<{ question: string; options: string[] }> | null;
    extracted_data?: any;
    classification_result_id?: string | number;
  };
  onClose: () => void;
  onSave: (item: any) => void;
  bulkRunId?: string | number;
}

export function BulkItemDetail({ item, onClose, onSave, bulkRunId }: BulkItemDetailProps) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [exceptionCategory, setExceptionCategory] = useState('Uncertain classification');
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get product data from extracted_data or fallback to direct properties
  const productData = item.extracted_data || {
    product_name: item.productName,
    product_description: item.description,
    country_of_origin: item.origin,
    materials: item.materials,
    unit_cost: item.cost,
    vendor: 'TechSupply Co.'
  };

  // Fetch classification result if ID is available
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    const fetchClassificationResult = async () => {
      if (!item.classification_result_id) return;

      try {
        setIsLoading(true);
        const { data, error: err } = await supabase
          .from('user_product_classification_results')
          .select('*')
          .eq('id', item.classification_result_id)
          .single();

        if (err) {
          console.error('Error fetching classification result:', err);
          setError('Failed to load classification details');
          return;
        }

        if (data) {
          setClassificationResult(data);
        }
      } catch (err) {
        console.error('Error fetching classification result:', err);
        setError('Failed to load classification details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchClassificationResult();
  }, [item.classification_result_id]);

  const handleApprove = async () => {
    if (!user) {
      setError('You must be logged in to approve products');
      return;
    }

    if (!item.hts && !classificationResult?.hts_classification) {
      setError('No HTS classification available for approval');
      return;
    }

    try {
      setIsApproving(true);
      setError(null);

      // Create product record
      const productId = await classificationService.saveProduct(
        user.id,
        (bulkRunId || 0) as number,
        {
          product_name: productData.product_name,
          product_description: productData.product_description,
          country_of_origin: productData.country_of_origin,
          materials: productData.materials,
          unit_cost: parseFloat(productData.unit_cost?.toString().replace('$', '') || '0'),
          vendor: productData.vendor,
          sku: item.id.toString()
        }
      );

      // If we don't have a classification result saved yet, create one
      let classificationResultId = item.classification_result_id as number | undefined;
      if (!classificationResultId && classificationResult) {
        classificationResultId = await classificationService.saveClassificationResult(
          productId,
          (bulkRunId || 0) as number,
          {
            hts_classification: classificationResult.hts_classification,
            confidence: classificationResult.confidence,
            description: classificationResult.description,
            reasoning: classificationResult.reasoning,
            tariff_rate: classificationResult.tariff_rate,
            chapter_code: classificationResult.chapter_code,
            chapter_title: classificationResult.chapter_title,
            section_code: classificationResult.section_code,
            section_title: classificationResult.section_title,
            cbp_rulings: classificationResult.cbp_rulings,
            alternate_classifications: classificationResult.alternate_classifications
          }
        );
      } else if (!classificationResultId) {
        // Create a minimal classification result from the item data
        classificationResultId = await classificationService.saveClassificationResult(
          productId,
          (bulkRunId || 0) as number,
          {
            hts_classification: item.hts || '',
            confidence: (item.confidence || 0) / 100, // Convert from percentage to decimal
            description: `HTS Code ${item.hts}`,
            reasoning: 'Classification from bulk upload'
          }
        );
      }

      // Save approval
      if (classificationResultId) {
        await classificationService.saveClassificationApproval(
          productId,
          classificationResultId,
          true,
          'Approved from bulk classification'
        );
      }

      // Show success and close
      alert('Product approved and saved successfully!');
      onClose();
    } catch (err: any) {
      console.error('Error approving product:', err);
      setError(err.message || 'Failed to approve product');
    } finally {
      setIsApproving(false);
    }
  };

  const handleFlagException = async () => {
    if (!user) {
      setError('You must be logged in to flag exceptions');
      return;
    }

    try {
      setIsApproving(true);
      setError(null);

      // For now, just close the dialog and show a message
      // In a real implementation, this would save to bulk_classification_items
      alert(`Exception flagged: ${exceptionCategory} ${exceptionNotes}`);
      onClose();
    } catch (err: any) {
      console.error('Error flagging exception:', err);
      setError(err.message || 'Failed to flag exception');
    } finally {
      setIsApproving(false);
      setShowExceptionDialog(false);
    }
  };

  // Use fetched classification or fallback to item data
  const currentClassification = classificationResult || {
    hts_classification: item.hts || '',
    confidence: (item.confidence || 0) / 100, // Convert percentage to decimal for consistency
    description: item.hts ? `HTS Code ${item.hts}` : '',
    reasoning: 'Classification reasoning',
    tariff_rate: item.tariff ? parseFloat(item.tariff.replace('%', '')) : 0
  };

  // Get alternatives from classification result if available
  const alternatives = classificationResult?.alternate_classifications || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h2 className="text-slate-900">{productData.product_name}</h2>
                <p className="text-slate-600 text-sm">SKU: {item.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Error Alert */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            )}

            {!isLoading && (
              <>
                {/* Current Classification Card */}
                <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                      <div className="text-green-900 mb-3">Current Classification</div>
                      <div className="text-green-800 text-xl mb-4">HTS Code: {currentClassification.hts_classification}</div>

                      <div className="space-y-1.5 text-sm mb-4">
                        {classificationResult?.chapter_code && (
                          <div className="flex items-start gap-2">
                            <span className="text-green-700 min-w-[70px]">Chapter</span>
                            <span className="text-green-800">{classificationResult.chapter_code} — {classificationResult.chapter_title}</span>
                          </div>
                        )}
                        {classificationResult?.section_code && (
                          <div className="flex items-start gap-2">
                            <span className="text-green-700 min-w-[70px]">Section</span>
                            <span className="text-green-800">{classificationResult.section_code} — {classificationResult.section_title}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <span className="text-green-700 min-w-[70px]">Description</span>
                          <span className="text-green-800">{currentClassification.description}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-700" />
                      <span className="text-green-900">{(currentClassification.confidence * 100).toFixed(0)}% Confidence</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <Calendar className="w-4 h-4" />
                    Last updated: {new Date().toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                {/* Product Information Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2 text-slate-700">
                      <FileText className="w-5 h-5" />
                      <span>Materials & Composition</span>
                    </div>
                    <p className="text-slate-900 text-sm">{productData.materials || 'Not specified'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2 text-slate-700">
                      <FileText className="w-5 h-5" />
                      <span>Country of Origin</span>
                    </div>
                    <p className="text-slate-900 text-sm">{productData.country_of_origin || 'Not specified'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2 text-slate-700">
                      <FileText className="w-5 h-5" />
                      <span>Unit Cost</span>
                    </div>
                    <p className="text-slate-900 text-sm">${productData.unit_cost || '0.00'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2 text-slate-700">
                      <FileText className="w-5 h-5" />
                      <span>Vendor</span>
                    </div>
                    <p className="text-slate-900 text-sm">{productData.vendor || 'Not specified'}</p>
                  </div>
                </div>

                {/* AI Reasoning Section */}
                {classificationResult?.reasoning && (
                  <div className="border border-blue-200 rounded-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3 border-b border-blue-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h3 className="text-blue-900">AI Reasoning</h3>
                      </div>
                    </div>
                    <div className="p-5 bg-white">
                      <p className="text-blue-800 text-sm">
                        {classificationResult.reasoning}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="border-t border-slate-200 pt-6 flex gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isApproving ? <Loader className="w-5 h-5 animate-spin" /> : <ThumbsUp className="w-5 h-5" />}
                    {isApproving ? 'Approving...' : 'Approve & Save Product'}
                  </button>
                  <button
                    onClick={() => setShowExceptionDialog(true)}
                    disabled={isApproving}
                    className="px-6 py-3 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Flag as Exception
                  </button>
                </div>

                {/* Alternative Classifications */}
                {Array.isArray(alternatives) && alternatives.length > 0 && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-amber-100 p-2 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-slate-900">Alternative Classifications</h3>
                        <p className="text-slate-600 text-sm">{alternatives.length} alternatives found</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {alternatives.map((alt, index) => (
                        <div key={index} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-slate-900">{alt.hts || alt.hts_classification}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-600 text-sm">Confidence: {(alt.confidence * 100).toFixed(0)}%</span>
                              <div className="w-20 h-2 bg-slate-200 rounded-full">
                                <div
                                  className="h-full bg-amber-500 rounded-full"
                                  style={{ width: `${Math.min((alt.confidence * 100), 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <p className="text-slate-700 text-sm">{alt.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Exception Dialog */}
      {showExceptionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-3 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Flag as Exception</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Exception Category
                </label>
                <select
                  value={exceptionCategory}
                  onChange={(e) => setExceptionCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option>Uncertain classification</option>
                  <option>Missing info</option>
                  <option>Needs manual review</option>
                  <option>Incorrect confidence</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={exceptionNotes}
                  onChange={(e) => setExceptionNotes(e.target.value)}
                  placeholder="Explain why this item is flagged as an exception..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowExceptionDialog(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagException}
                disabled={isApproving}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? 'Flagging...' : 'Flag Exception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
