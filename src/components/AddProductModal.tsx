import { useState } from 'react';
import { X, ArrowLeft, Sparkles, Save, Loader2 } from 'lucide-react';
import { classifyProduct } from '../lib/supabaseFunctions';
import { supabase } from '../lib/supabase';

interface AddProductModalProps {
  onClose: () => void;
  onSave: (product: any) => void;
  editingProduct?: any;
}

export function AddProductModal({ onClose, onSave, editingProduct }: AddProductModalProps) {
  const [step, setStep] = useState<'info' | 'classify'>('info');
  const [formData, setFormData] = useState({
    name: editingProduct && editingProduct.name ? editingProduct.name : '',
    sku: editingProduct && editingProduct.sku ? editingProduct.sku : '',
    description: editingProduct && editingProduct.description ? editingProduct.description : '',
    materials: editingProduct && editingProduct.materials ? editingProduct.materials : '',
    origin: editingProduct && editingProduct.origin ? editingProduct.origin : '',
    cost: editingProduct && editingProduct.cost ? editingProduct.cost : '',
    vendor: editingProduct && editingProduct.vendor ? editingProduct.vendor : '',
  });
  const [classification, setClassification] = useState<{
    hts: string;
    confidence: number;
    description: string;
    tariff: string;
  } | null>(editingProduct && editingProduct.hts ? {
    hts: editingProduct.hts,
    confidence: editingProduct.confidence,
    description: 'Product classification',
    tariff: '0%'
  } : null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  const handleClassify = async () => {
    setIsClassifying(true);
    setClassifyError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setClassifyError('Please log in to classify products');
        setIsClassifying(false);
        return;
      }

      // Build description from form data
      let description = `${formData.name}. ${formData.description}`;
      if (formData.materials) description += `. Materials: ${formData.materials}`;
      if (formData.origin) description += `. Country of origin: ${formData.origin}`;

      const response = await classifyProduct(description, user.id);

      if (!response) {
        setClassifyError('Classification failed. Please try again.');
        setIsClassifying(false);
        return;
      }

      // Extract the top match from the response
      let topMatch: { hts: string; description: string; confidence: number } | null = null;

      if (response.type === 'answer' && response.matches) {
        const matches = Array.isArray(response.matches)
          ? response.matches
          : response.matches.matched_rules || [];
        if (matches.length > 0) {
          topMatch = {
            hts: matches[0].hts || 'N/A',
            description: matches[0].description || '',
            confidence: Math.round((matches[0].confidence || matches[0].score || 0) * 100),
          };
        }
      } else if (response.candidates && response.candidates.length > 0) {
        topMatch = {
          hts: response.candidates[0].hts || 'N/A',
          description: response.candidates[0].description || '',
          confidence: Math.round((response.candidates[0].confidence || response.candidates[0].score || 0) * 100),
        };
      }

      if (topMatch) {
        setClassification({
          hts: topMatch.hts,
          confidence: topMatch.confidence,
          description: topMatch.description,
          tariff: 'See full classification for rates',
        });
        setStep('classify');
      } else {
        setClassifyError('No classification results found. Try providing more product details.');
      }
    } catch (error: any) {
      console.error('Classification error:', error);
      setClassifyError(error.message || 'An error occurred during classification');
    } finally {
      setIsClassifying(false);
    }
  };

  const handleSave = () => {
    const product = {
      id: editingProduct && editingProduct.id ? editingProduct.id : Date.now(),
      name: formData.name,
      sku: formData.sku,
      hts: classification && classification.hts ? classification.hts : '',
      materials: formData.materials,
      origin: formData.origin,
      cost: formData.cost,
      vendor: formData.vendor,
      confidence: classification && classification.confidence ? classification.confidence : 0,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    onSave(product);
  };

  const isFormValid = formData.name && formData.description && formData.origin;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === 'classify' && (
              <button 
                onClick={() => setStep('info')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
            )}
            <div>
              <h2 className="text-slate-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <p className="text-slate-600 text-sm">
                {step === 'info' ? 'Enter product details' : 'Review AI classification'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6">
          {step === 'info' ? (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-slate-900 mb-4">Basic Information</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 mb-2">Product Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Wireless Bluetooth Speaker"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-2">SKU</label>
                      <input
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        placeholder="e.g., WBS-001"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">Description *</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Detailed product description for classification..."
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-500 text-sm mt-1">
                      Include key features, materials, and intended use for accurate AI classification
                    </p>
                  </div>
                </div>
              </div>

              {/* Product Details */}
              <div>
                <h3 className="text-slate-900 mb-4">Product Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 mb-2">Materials/Composition</label>
                    <input
                      type="text"
                      value={formData.materials}
                      onChange={(e) => setFormData({ ...formData, materials: e.target.value })}
                      placeholder="e.g., ABS Plastic, Lithium Battery"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">Country of Origin *</label>
                    <select
                      value={formData.origin}
                      onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select country...</option>
                      <option value="China">China</option>
                      <option value="Mexico">Mexico</option>
                      <option value="Canada">Canada</option>
                      <option value="Vietnam">Vietnam</option>
                      <option value="India">India</option>
                      <option value="South Korea">South Korea</option>
                      <option value="Japan">Japan</option>
                      <option value="Germany">Germany</option>
                      <option value="United States">United States</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">Unit Cost</label>
                    <input
                      type="text"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      placeholder="e.g., $12.50"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-2">Vendor/Supplier</label>
                    <input
                      type="text"
                      value={formData.vendor}
                      onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                      placeholder="e.g., TechSupply Co."
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {classifyError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {classifyError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handleClassify}
                  disabled={!isFormValid || isClassifying}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isClassifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {isClassifying ? 'Classifying...' : 'Classify with AI'}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Classification Result */}
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-slate-900">AI Classification Result</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-sm">Confidence:</span>
                    <span className="text-green-900">{classification && classification.confidence ? classification.confidence : 0}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-white rounded-lg">
                  <div>
                    <span className="text-slate-600 text-sm block mb-1">HTS Code</span>
                    <span className="text-slate-900">{classification && classification.hts ? classification.hts : ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 text-sm block mb-1">Tariff Rate</span>
                    <span className="text-slate-900">{classification && classification.tariff ? classification.tariff : ''}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-600 text-sm block mb-2">Description</span>
                  <p className="text-slate-700">{classification && classification.description ? classification.description : ''}</p>
                </div>
              </div>

              {/* Product Summary */}
              <div className="border border-slate-200 rounded-lg p-6">
                <h3 className="text-slate-900 mb-4">Product Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-600 block mb-1">Product Name</span>
                    <span className="text-slate-900">{formData.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">SKU</span>
                    <span className="text-slate-900">{formData.sku || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">Country of Origin</span>
                    <span className="text-slate-900">{formData.origin}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">Materials</span>
                    <span className="text-slate-900">{formData.materials || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">Unit Cost</span>
                    <span className="text-slate-900">{formData.cost || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">Vendor</span>
                    <span className="text-slate-900">{formData.vendor || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingProduct ? 'Update Product' : 'Save Product'}
                </button>
                <button
                  onClick={() => setStep('info')}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Edit Details
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}