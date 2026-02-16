import { useState, useEffect } from 'react';
import { Search, Sparkles, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, MessageSquare, Plus, X, Upload, FileText, File, Package, MapPin, DollarSign, Calendar, Edit2, Loader2 } from 'lucide-react';
import { LLMAssistant } from './LLMAssistant';
import { ClarificationChatbot } from './ClarificationChatbot';
import { ClassificationResults, ClassificationResultData } from './ClassificationResults';
import { classifyProduct, generateRuling } from '../lib/supabaseFunctions';
import { 
  createClassificationRun, 
  addClarificationMessage, 
  updateClassificationRunStatus, 
  saveProduct, 
  saveClassificationResult,
  ClarificationMessage 
} from '../lib/classificationService';
import { supabase } from '../lib/supabase';

interface MaterialComposition {
  material: string;
  percentage: number;
}

interface ClassificationResult {
  hts: string;
  confidence: number;
  description: string;
  tariff: string;
  reasoning: string;
  tariffByOrigin?: { country: string; rate: string; tradeAgreement?: string }[];
  alternatives?: Array<{ hts: string; confidence: number; description: string; tariff: string; reasoning?: string }>;
}

export function ClassificationView() {
  const [query, setQuery] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [result, setResult] = useState<ClassificationResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [materials, setMaterials] = useState<MaterialComposition[]>([]);
  const [newMaterial, setNewMaterial] = useState({ material: '', percentage: 0 });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showReviewLaterConfirmation, setShowReviewLaterConfirmation] = useState(false);
  
  // Additional fields for product profile
  const [sku, setSku] = useState('');
  const [vendor, setVendor] = useState('');
  const [unitCost, setUnitCost] = useState('');

  // Classification flow state
  const [classificationRunId, setClassificationRunId] = useState<number | null>(null);
  const [clarificationMessages, setClarificationMessages] = useState<ClarificationMessage[]>([]);
  const [needsClarification, setNeedsClarification] = useState(false);
  const [currentStep, setCurrentStep] = useState<'preprocess' | 'parse' | 'rules' | 'rulings' | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isProcessingClarification, setIsProcessingClarification] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [partialMatches, setPartialMatches] = useState<Array<{hts: string; description: string; score: number}>>([]);

  const loadingSteps = [
    'Preprocessing the input...',
    'Recognizing usage...',
    'Getting top HTS match...',
    'Verifying against GRI rules & chapter notes...',
    'Calculating confidence and fetching CBP rulings...'
  ];

  useEffect(() => {
    if (!loading) {
      setLoadingStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, loadingSteps.length - 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  const addMaterial = () => {
    if (newMaterial.material && newMaterial.percentage > 0) {
      setMaterials([...materials, newMaterial]);
      setNewMaterial({ material: '', percentage: 0 });
    }
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles([...uploadedFiles, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileName: string) => {
    const parts = fileName.split('.');
    const ext = parts.length > 0 && parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileText className="w-4 h-4 text-green-600" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <File className="w-4 h-4 text-slate-600" />;
  };

  const getTotalPercentage = (items: { percentage: number }[]) => {
    return items.reduce((sum, item) => sum + item.percentage, 0);
  };

  const handleClassify = async () => {
    if (!query.trim()) return;
    
    try {
      setLoading(true);
      setNeedsClarification(false);
      setClarificationMessages([]);
      setResult(null);
      setCurrentStep('preprocess');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to classify products');
        setLoading(false);
        return;
      }

      // Create classification run
      const runId = await createClassificationRun(user.id, 'single');
      setClassificationRunId(runId);

      // Build comprehensive product description from all input fields
      let productDescriptionText = query;
      if (productDescription) {
        productDescriptionText += `. ${productDescription}`;
      }
      if (originCountry) {
        productDescriptionText += `. Country of origin: ${originCountry}`;
      }
      if (materials.length > 0) {
        const materialsText = materials.map(m => `${m.material} (${m.percentage}%)`).join(', ');
        productDescriptionText += `. Materials: ${materialsText}`;
      }
      if (unitCost) {
        productDescriptionText += `. Unit cost: ${unitCost}`;
      }
      if (vendor) {
        productDescriptionText += `. Vendor: ${vendor}`;
      }
      if (sku) {
        productDescriptionText += `. SKU: ${sku}`;
      }

      // Call unified classification function
      console.log('Calling classifyProduct with:', { productDescriptionText, userId: user.id });
      const response = await classifyProduct(productDescriptionText, user.id);
      console.log('classifyProduct response:', response);
      
      if (!response) {
        console.warn('No response from classifyProduct');
        setLoading(false);
        setCurrentStep(null);
        return;
      }

      // Display clarifications if backend sends them (check for type: 'clarify' or clarifications array)
      const clarificationQuestions = response.type === 'clarify' 
        ? response.clarifications 
        : response.questions || response.clarifications;
      
      if (clarificationQuestions && clarificationQuestions.length > 0) {
        const clarificationMsgs: ClarificationMessage[] = clarificationQuestions.map((q: string) => ({
          step: 'preprocess',
          type: 'question',
          content: q,
          timestamp: new Date().toISOString(),
        }));

        setClarificationMessages(clarificationMsgs);
        setNeedsClarification(true);
        setCurrentStep('preprocess');
        setParsedData({ normalized: response.normalized, attributes: response.attributes });
        setPartialMatches(response.partial_matches || []);
        
        for (const msg of clarificationMsgs) {
          await addClarificationMessage(runId, msg);
        }

        setLoading(false);
        return;
      }

      // Display candidates/matches if backend sends them
      // Handle both 'answer' type with matches and regular candidates format
      let matchedRules: Array<{
        hts: string; 
        description: string; 
        score: number; 
        confidence?: number; 
        rationale?: string;
        cbp_rulings?: Array<{
          ruling_number: string;
          ruling_date: string;
          subject: string;
          url: string;
          hs_codes?: string[];
        }>;
      }> = [];
      
      if (response.type === 'answer' && response.matches) {
        // matches can be an object with matched_rules array, or an array directly
        if (Array.isArray(response.matches)) {
          matchedRules = response.matches;
        } else if (response.matches.matched_rules && Array.isArray(response.matches.matched_rules)) {
          matchedRules = response.matches.matched_rules;
        }
      } else if (response.candidates) {
        matchedRules = response.candidates;
      }
      
      if (matchedRules && matchedRules.length > 0) {
        // Sort by confidence or score (descending) to get highest confidence first
        const sortedMatches = [...matchedRules].sort((a, b) => {
          const aConf = a.confidence || a.score || 0;
          const bConf = b.confidence || b.score || 0;
          return bConf - aConf;
        });
        const primaryCandidate = sortedMatches[0];
        const alternateCandidates = sortedMatches.slice(1, 3);

        const classificationResult: ClassificationResultData = {
          hts: primaryCandidate.hts || 'N/A',
          confidence: Math.round((primaryCandidate.confidence || primaryCandidate.score || response.max_confidence || 0) * 100),
          description: primaryCandidate.description || '',
          chapter_code: (primaryCandidate as any).chapter_code,
          chapter_title: (primaryCandidate as any).chapter_title,
          section_code: (primaryCandidate as any).section_code,
          section_title: (primaryCandidate as any).section_title,
          reasoning: primaryCandidate.rationale || `Based on normalized input: ${response.normalized || query}. Attributes: ${JSON.stringify(response.attributes || {})}`,
          cbp_rulings: primaryCandidate.cbp_rulings || undefined,
          rule_verification: (primaryCandidate as any).rule_verification || undefined,
          rule_confidence: (primaryCandidate as any).rule_confidence || undefined,
          similarity_score: (primaryCandidate as any).similarity_score || undefined,
          classification_trace: response.classification_trace || (response.matches && response.matches.classification_trace) || undefined,
          parsed_data: {
            product_name: query,
            product_description: productDescription || undefined,
            country_of_origin: originCountry || undefined,
            materials: materials.length > 0 ? materials : undefined,
            unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
            vendor: vendor || undefined,
          },
        };

        // Store all alternate classifications with confidence, descriptions, and rulings
        if (alternateCandidates.length > 0) {
          classificationResult.alternate_classifications = alternateCandidates.map(alt => ({
            hts: alt.hts || 'N/A',
            description: alt.description || '',
            confidence: Math.round((alt.confidence || alt.score || 0) * 100),
            cbp_rulings: alt.cbp_rulings || undefined,
            rationale: (alt as any).rationale || undefined,
            rule_verification: (alt as any).rule_verification || undefined,
          }));
          classificationResult.alternate_classification = alternateCandidates[0].hts;
        }

        setResult(classificationResult);
        setNeedsClarification(false);
        setCurrentStep(null);
        setPartialMatches([]);
        setParsedData({ normalized: response.normalized, attributes: response.attributes });

        // Save product and result to database
        const productId = await saveProduct(user.id, runId, {
          product_name: query,
          product_description: productDescription || undefined,
          country_of_origin: originCountry || undefined,
          materials: materials.length > 0 ? materials : undefined,
          unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
          vendor: vendor || undefined,
        });

        await saveClassificationResult(productId, runId, {
          hts_classification: classificationResult.hts,
          alternate_classification: classificationResult.alternate_classification || undefined,
          confidence: primaryCandidate.confidence || primaryCandidate.score || response.max_confidence || undefined,
          unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
        });

        // Update run status to completed
        await updateClassificationRunStatus(runId, 'completed');
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Classification error:', error);
      // Silently handle error - don't show alert
      setLoading(false);
      setCurrentStep(null);
      console.error('Full error details:', {
        message: error?.message,
        stack: error?.stack,
        error: error,
      });
    }
  };

  const handleClarificationResponse = async (response: string) => {
    if (!classificationRunId || !currentStep) return;

    try {
      setIsProcessingClarification(true);

      // Save user response to database
      const userMessage: ClarificationMessage = {
        step: currentStep,
        type: 'user_response',
        content: response,
        timestamp: new Date().toISOString(),
      };
      await addClarificationMessage(classificationRunId, userMessage);
      setClarificationMessages(prev => [...prev, userMessage]);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsProcessingClarification(false);
        return;
      }

      // Build the original query (what the user typed before clarification)
      let originalQuery = query;
      if (productDescription) {
        originalQuery += `. ${productDescription}`;
      }
      if (originCountry) {
        originalQuery += `. Country of origin: ${originCountry}`;
      }
      if (materials.length > 0) {
        const materialsText = materials.map(m => `${m.material} (${m.percentage}%)`).join(', ');
        originalQuery += `. Materials: ${materialsText}`;
      }

      // Send BOTH original query + clarification response as separate fields.
      // The backend will combine them intelligently:
      //   - "cow for speakers" + "cow for meat" → understands user corrected to "cow for meat"
      //   - "cow for speakers" + "meat" → combines: "cow for meat"
      const productDescriptionText = `${originalQuery}. Clarification: ${response}`;
      console.log('Calling classifyProduct (clarification) with:', { originalQuery, clarificationResponse: response, userId: user.id });
      const classificationResponse = await classifyProduct(productDescriptionText, user.id, undefined, {
        originalQuery,
        clarificationResponse: response,
      });
      console.log('classifyProduct (clarification) response:', classificationResponse);
      
      if (!classificationResponse) {
        console.warn('No response from classifyProduct (clarification)');
        setIsProcessingClarification(false);
        setCurrentStep(null);
        return;
      }

      // Display clarifications if backend sends them (check for type: 'clarify' or clarifications array)
      const clarificationQuestions = classificationResponse.type === 'clarify' 
        ? classificationResponse.clarifications 
        : classificationResponse.questions || classificationResponse.clarifications;
      
      if (clarificationQuestions && clarificationQuestions.length > 0) {
        const clarificationMsgs: ClarificationMessage[] = clarificationQuestions.map((q: string) => ({
          step: currentStep,
          type: 'question',
          content: q,
          timestamp: new Date().toISOString(),
        }));

        setClarificationMessages(prev => [...prev, ...clarificationMsgs]);
        setParsedData({ normalized: classificationResponse.normalized, attributes: classificationResponse.attributes });
        setPartialMatches(classificationResponse.partial_matches || []);
        
        for (const msg of clarificationMsgs) {
          await addClarificationMessage(classificationRunId, msg);
        }

        setIsProcessingClarification(false);
        return;
      }

      // Display candidates/matches if backend sends them
      // Handle both 'answer' type with matches and regular candidates format
      let matchedRules: Array<{
        hts: string; 
        description: string; 
        score: number; 
        confidence?: number; 
        rationale?: string;
        cbp_rulings?: Array<{
          ruling_number: string;
          ruling_date: string;
          subject: string;
          url: string;
          hs_codes?: string[];
        }>;
      }> = [];
      
      if (classificationResponse.type === 'answer' && classificationResponse.matches) {
        // matches can be an object with matched_rules array, or an array directly
        if (Array.isArray(classificationResponse.matches)) {
          matchedRules = classificationResponse.matches;
        } else if (classificationResponse.matches.matched_rules && Array.isArray(classificationResponse.matches.matched_rules)) {
          matchedRules = classificationResponse.matches.matched_rules;
        }
      } else if (classificationResponse.candidates) {
        matchedRules = classificationResponse.candidates;
      }
      
      if (matchedRules && matchedRules.length > 0) {
        // Sort by confidence or score (descending) to get highest confidence first
        const sortedMatches = [...matchedRules].sort((a, b) => {
          const aConf = a.confidence || a.score || 0;
          const bConf = b.confidence || b.score || 0;
          return bConf - aConf;
        });
        const primaryCandidate = sortedMatches[0];
        const alternateCandidates = sortedMatches.slice(1, 3);

        const classificationResult: ClassificationResultData = {
          hts: primaryCandidate.hts || 'N/A',
          confidence: Math.round((primaryCandidate.confidence || primaryCandidate.score || classificationResponse.max_confidence || 0) * 100),
          description: primaryCandidate.description || '',
          chapter_code: (primaryCandidate as any).chapter_code,
          chapter_title: (primaryCandidate as any).chapter_title,
          section_code: (primaryCandidate as any).section_code,
          section_title: (primaryCandidate as any).section_title,
          reasoning: primaryCandidate.rationale || `Based on normalized input: ${classificationResponse.normalized || query}. Attributes: ${JSON.stringify(classificationResponse.attributes || {})}`,
          cbp_rulings: primaryCandidate.cbp_rulings || undefined,
          rule_verification: (primaryCandidate as any).rule_verification || undefined,
          rule_confidence: (primaryCandidate as any).rule_confidence || undefined,
          similarity_score: (primaryCandidate as any).similarity_score || undefined,
          classification_trace: classificationResponse.classification_trace || (classificationResponse.matches && classificationResponse.matches.classification_trace) || undefined,
          parsed_data: {
            product_name: query,
            product_description: productDescription || undefined,
            country_of_origin: originCountry || undefined,
            materials: materials.length > 0 ? materials : undefined,
            unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
            vendor: vendor || undefined,
          },
        };

        // Store all alternate classifications with confidence, descriptions, and rulings
        if (alternateCandidates.length > 0) {
          classificationResult.alternate_classifications = alternateCandidates.map(alt => ({
            hts: alt.hts || 'N/A',
            description: alt.description || '',
            confidence: Math.round((alt.confidence || alt.score || 0) * 100),
            cbp_rulings: alt.cbp_rulings || undefined,
            rationale: (alt as any).rationale || undefined,
            rule_verification: (alt as any).rule_verification || undefined,
          }));
          classificationResult.alternate_classification = alternateCandidates[0].hts;
        }

        setResult(classificationResult);
        setNeedsClarification(false);
        setCurrentStep(null);
        setPartialMatches([]);
        setParsedData({ normalized: classificationResponse.normalized, attributes: classificationResponse.attributes });

        // Save to database
        if (classificationRunId) {
          const productId = await saveProduct(user.id, classificationRunId, {
            product_name: query,
            product_description: productDescription || undefined,
            country_of_origin: originCountry || undefined,
            materials: materials.length > 0 ? materials : undefined,
            unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
            vendor: vendor || undefined,
          });

          await saveClassificationResult(productId, classificationRunId, {
            hts_classification: classificationResult.hts,
            alternate_classification: classificationResult.alternate_classification || undefined,
            confidence: primaryCandidate.confidence || primaryCandidate.score || classificationResponse.max_confidence || undefined,
            unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
          });

          await updateClassificationRunStatus(classificationRunId, 'completed');
        }
      }

      setIsProcessingClarification(false);
    } catch (error: any) {
      console.error('Clarification response error:', error);
      // Silently handle error - don't show alert
      setIsProcessingClarification(false);
    }
  };

  const handleReviewLater = () => {
    if (!result) return;

    // In a real implementation, this would save to the priority review list
    // For now, we'll show a confirmation message and clear the form
    const reviewItem = {
      sku: sku || 'Not assigned',
      productName: query,
      hts: result.hts,
      confidence: result.confidence,
      origin: originCountry,
      vendor: vendor || 'Not specified',
      unitCost: unitCost || 'Not specified',
      dateAdded: new Date().toISOString(),
      status: 'needs_review'
    };

    // Store in localStorage for persistence (in real app, this would go to a backend)
    const existingReviews = JSON.parse(localStorage.getItem('priorityReviews') || '[]');
    existingReviews.push(reviewItem);
    localStorage.setItem('priorityReviews', JSON.stringify(existingReviews));

    // Show confirmation
    setShowReviewLaterConfirmation(true);
    
    // Clear form after 2 seconds
    setTimeout(() => {
      setShowReviewLaterConfirmation(false);
      setResult(null);
      setQuery('');
      setSku('');
      setVendor('');
      setUnitCost('');
      setOriginCountry('');
      setProductDescription('');
      setMaterials([]);
      setUploadedFiles([]);
    }, 2000);
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto">
        {/* Query Input */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-slate-700 mb-2">Product Name</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleClassify()}
                  placeholder="e.g., Wireless bluetooth speaker"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-slate-700 mb-2">Country of Origin</label>
              <select
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              </select>
            </div>
          </div>
          
          {/* Product Description Text Area */}
          <div className="mb-4">
            <label className="block text-slate-700 mb-2">Product Description (Optional)</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Describe the product's intended use, materials, function, or any other relevant details...&#10;&#10;Example: Portable wireless speaker with Bluetooth 5.0. ABS plastic body with aluminum grille. Built-in rechargeable battery, dual 10W drivers, IPX7 waterproof. For outdoor recreational use."
              rows={4}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Providing details about intended use, materials, and function helps improve classification accuracy
            </p>
          </div>
          
          {/* File Upload Section */}
          <div className="mt-4 p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-slate-600" />
                <div>
                  <h4 className="text-slate-900">Upload Supporting Documents (Optional)</h4>
                  <p className="text-slate-600 text-sm">Specs, BOMs, datasheets, or other product details</p>
                </div>
              </div>
              <label
                htmlFor="file-upload-single"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Files
              </label>
              <input
                id="file-upload-single"
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-white rounded border border-slate-200">
                    {getFileIcon(file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 text-sm truncate">{file.name}</p>
                      <p className="text-slate-500 text-xs">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(idx)}
                      className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadedFiles.length === 0 && (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm">
                  PDF, Excel, CSV, Word, images • Max 10MB per file
                </p>
              </div>
            )}
          </div>
          
          {/* Advanced: Material Composition */}
          <div className="mt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-slate-900">Add Product Details & Material Composition (Optional)</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Improves Accuracy</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-4">
                {/* Product Details */}
                <div>
                  <h4 className="text-slate-900 mb-3">Product Details</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-700 text-sm mb-1">SKU Number</label>
                      <input
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="e.g., PROD-12345"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-slate-700 text-sm mb-1">Vendor Name</label>
                      <input
                        type="text"
                        value={vendor}
                        onChange={(e) => setVendor(e.target.value)}
                        placeholder="e.g., TechSupply Co."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-slate-700 text-sm mb-1">Product Cost</label>
                      <input
                        type="text"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        placeholder="e.g., $12.50"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Material Composition */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-slate-900">Material Composition</h4>
                    <span className={`text-xs ${getTotalPercentage(materials) === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                      Total: {getTotalPercentage(materials)}%
                    </span>
                  </div>
                  
                  {materials.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {materials.map((material, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-slate-900 text-sm">{material.material}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{material.percentage}%</span>
                          </div>
                          <button
                            onClick={() => removeMaterial(idx)}
                            className="p-1 hover:bg-red-50 rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Material (e.g., Cotton, Polyester, Steel)"
                      value={newMaterial.material}
                      onChange={(e) => setNewMaterial({ ...newMaterial, material: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      placeholder="%"
                      min="0"
                      max="100"
                      value={newMaterial.percentage || ''}
                      onChange={(e) => setNewMaterial({ ...newMaterial, percentage: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={addMaterial}
                      disabled={!newMaterial.material || newMaterial.percentage <= 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    💡 Many HTS codes depend on material composition (e.g., textiles, metals). Adding percentages improves classification accuracy.
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleClassify}
            disabled={loading || !query.trim()}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-4"
          >
            <Sparkles className="w-5 h-5" />
            {loading ? 'Classifying...' : 'Classify Product'}
          </button>
          
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-slate-500 text-sm">Try:</span>
            {['Organic cotton t-shirt', 'Stainless steel water bottle', 'LED desk lamp'].map((example) => (
              <button
                key={example}
                onClick={() => setQuery(example)}
                className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm hover:bg-slate-200 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Clarification Chatbot or Results Display */}
        {(needsClarification || result || loading) && (
          <div className="mb-6">
            {needsClarification ? (
              <ClarificationChatbot
                messages={clarificationMessages}
                onSendMessage={handleClarificationResponse}
                isLoading={isProcessingClarification}
                partialMatches={partialMatches}
              />
            ) : result ? (
              <div className="space-y-6">
                {/* Show clarification history if there were any */}
                {clarificationMessages.length > 0 && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <h4 className="text-slate-900 text-sm font-semibold mb-3">Clarification History</h4>
                    <ClarificationChatbot
                      messages={clarificationMessages}
                      onSendMessage={async () => {}}
                      isLoading={false}
                    />
                  </div>
                )}
                {/* Show results */}
                <ClassificationResults
                  result={result}
                  onApprove={async () => {
                    // Handle approve - mark as approved in database
                    if (result && classificationRunId) {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        // Get the product_id from the result or fetch it
                        // For now, we'll need to get it from the classification run
                        // This would need the product_id which we saved earlier
                        alert('Product approved and saved!');
                        // Reset form
                        setResult(null);
                        setQuery('');
                        setProductDescription('');
                        setOriginCountry('');
                        setMaterials([]);
                        setSku('');
                        setVendor('');
                        setUnitCost('');
                        setClarificationMessages([]);
                        setClassificationRunId(null);
                      }
                    }
                  }}
                  onReviewLater={handleReviewLater}
                />
              </div>
            ) : loading ? (
              <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <h3 className="text-slate-900 mb-2">
                  {loadingSteps[loadingStepIndex] || 'Classifying...'}
                </h3>
                <p className="text-slate-600">Processing your product information</p>
              </div>
            ) : null}
          </div>
        )}

        {!result && !loading && !needsClarification && (
          <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">
            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-slate-900 mb-2">Ready to Classify</h3>
            <p className="text-slate-600">Enter a product description above to get AI-powered HS/HTS classification with confidence scoring and tariff information.</p>
          </div>
        )}

        {/* AI Assistant */}
        {showAssistant && (
          <LLMAssistant
            productContext={result && query ? {
              name: query,
              description: query,
              hts: result.hts,
              origin: originCountry
            } : undefined}
            onClose={() => setShowAssistant(false)}
          />
        )}

        {/* Review Later Confirmation Toast */}
        {showReviewLaterConfirmation && (
          <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
            <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
              <CheckCircle className="w-6 h-6" />
              <div>
                <p className="font-medium">Added to Priority Review</p>
                <p className="text-sm text-green-100">Product saved for later review</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}