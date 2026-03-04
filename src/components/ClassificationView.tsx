import { useState, useEffect } from 'react';
import { Search, Sparkles, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, MessageSquare, Plus, X, Upload, FileText, File, Package, MapPin, DollarSign, Calendar, Edit2, Loader2 } from 'lucide-react';
import { ClarificationChatbot } from './ClarificationChatbot';
import { ClassificationResults, ClassificationResultData } from './ClassificationResults';
import { IntendedUseModal, IntendedUseAnswers, buildIntendedUseText } from './IntendedUseModal';
import { classifyProduct } from '../lib/supabaseFunctions';
import {
  createClassificationRun,
  addClarificationMessage,
  updateClassificationRunStatus,
  saveProduct,
  saveClassificationResult,
  saveClassificationApproval,
  ClarificationMessage
} from '../lib/classificationService';
import { getUserMetadata } from '../lib/userService';
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

interface ClassificationViewProps {
  chatClassificationResult?: any;
  onChatResultConsumed?: () => void;
}

export function ClassificationView({ chatClassificationResult, onChatResultConsumed }: ClassificationViewProps = {}) {
  const [query, setQuery] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [result, setResult] = useState<ClassificationResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
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
  const [wasAutoApproved, setWasAutoApproved] = useState(false);
  const [showIntendedUseModal, setShowIntendedUseModal] = useState(false);

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

  // Accept classification result from chat panel
  useEffect(() => {
    if (chatClassificationResult) {
      setResult(chatClassificationResult);
      setNeedsClarification(false);
      setCurrentStep(null);
      setPartialMatches([]);
      setWasAutoApproved(false);
      setLoading(false);
      if (onChatResultConsumed) {
        onChatResultConsumed();
      }
    }
  }, [chatClassificationResult]);

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

  const handleClassifyClick = () => {
    if (!query.trim()) return;
    setShowIntendedUseModal(true);
  };

  const handleModalConfirm = (answers: IntendedUseAnswers) => {
    setShowIntendedUseModal(false);
    handleClassify(answers);
  };

  const handleClassify = async (intendedUseAnswers?: IntendedUseAnswers) => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      setNeedsClarification(false);
      setClarificationMessages([]);
      setResult(null);
      setWasAutoApproved(false);
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
      // Append intended use context if provided
      if (intendedUseAnswers?.primaryUse) {
        productDescriptionText += `. ${buildIntendedUseText(intendedUseAnswers)}`;
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
        // Normalize: questions can be strings or {question, options} objects
        const clarificationMsgs: ClarificationMessage[] = clarificationQuestions.map((q: any) => {
          const isStructured = typeof q === 'object' && q.question;
          return {
            step: 'preprocess' as const,
            type: 'question' as const,
            content: isStructured ? q.question : String(q),
            timestamp: new Date().toISOString(),
            metadata: isStructured && q.options?.length ? { options: q.options } : undefined,
          };
        });

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
        setWasAutoApproved(false);
        setParsedData({ normalized: response.normalized, attributes: response.attributes });

        // Save product and result to database
        const productId = await saveProduct(user.id, runId, {
          product_name: query,
          product_description: productDescription || undefined,
          country_of_origin: originCountry || undefined,
          materials: materials.length > 0 ? materials : undefined,
          unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
          vendor: vendor || undefined,
          sku: sku || undefined,
        });

        const classResultId = await saveClassificationResult(productId, runId, {
          hts_classification: classificationResult.hts,
          alternate_classification: classificationResult.alternate_classification || undefined,
          confidence: primaryCandidate.confidence || primaryCandidate.score || response.max_confidence || undefined,
          unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
          description: classificationResult.description || undefined,
          reasoning: classificationResult.reasoning || undefined,
          chapter_code: classificationResult.chapter_code || undefined,
          chapter_title: classificationResult.chapter_title || undefined,
          section_code: classificationResult.section_code || undefined,
          section_title: classificationResult.section_title || undefined,
          cbp_rulings: classificationResult.cbp_rulings || undefined,
          rule_verification: classificationResult.rule_verification || undefined,
          rule_confidence: classificationResult.rule_confidence || undefined,
          similarity_score: classificationResult.similarity_score || undefined,
          alternate_classifications: classificationResult.alternate_classifications || undefined,
        });

        // Update run status to completed
        await updateClassificationRunStatus(runId, 'completed');

        // Auto-approve if enabled and confidence meets threshold
        const rawConfidence = primaryCandidate.confidence || primaryCandidate.score || response.max_confidence || 0;
        const userMetadata = await getUserMetadata(user.id);
        const threshold = userMetadata?.confidence_threshold ?? 0.8;
        if (userMetadata?.auto_approve_single && rawConfidence >= threshold) {
          await saveClassificationApproval(
            productId,
            classResultId,
            true,
            `Auto-approved: confidence (${Math.round(rawConfidence * 100)}%) is above ${Math.round(threshold * 100)}% threshold`
          );
          setWasAutoApproved(true);
        }
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
        const errorMsg: ClarificationMessage = {
          step: currentStep!,
          type: 'system' as const,
          content: 'Classification failed. Please try again or rephrase your answer.',
          timestamp: new Date().toISOString(),
        };
        setClarificationMessages(prev => [...prev, errorMsg]);
        setIsProcessingClarification(false);
        return;
      }

      // Display clarifications if backend sends them (check for type: 'clarify' or clarifications array)
      const clarificationQuestions = classificationResponse.type === 'clarify' 
        ? classificationResponse.clarifications 
        : classificationResponse.questions || classificationResponse.clarifications;
      
      if (clarificationQuestions && clarificationQuestions.length > 0) {
        // Normalize: questions can be strings or {question, options} objects
        const clarificationMsgs: ClarificationMessage[] = clarificationQuestions.map((q: any) => {
          const isStructured = typeof q === 'object' && q.question;
          return {
            step: currentStep!,
            type: 'question' as const,
            content: isStructured ? q.question : String(q),
            timestamp: new Date().toISOString(),
            metadata: isStructured && q.options?.length ? { options: q.options } : undefined,
          };
        });

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
        setWasAutoApproved(false);
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
            sku: sku || undefined,
          });

          const classResultId = await saveClassificationResult(productId, classificationRunId, {
            hts_classification: classificationResult.hts,
            alternate_classification: classificationResult.alternate_classification || undefined,
            confidence: primaryCandidate.confidence || primaryCandidate.score || classificationResponse.max_confidence || undefined,
            unit_cost: unitCost ? parseFloat(unitCost.replace(/[^0-9.]/g, '')) : undefined,
            description: classificationResult.description || undefined,
            reasoning: classificationResult.reasoning || undefined,
            chapter_code: classificationResult.chapter_code || undefined,
            chapter_title: classificationResult.chapter_title || undefined,
            section_code: classificationResult.section_code || undefined,
            section_title: classificationResult.section_title || undefined,
            cbp_rulings: classificationResult.cbp_rulings || undefined,
            rule_verification: classificationResult.rule_verification || undefined,
            rule_confidence: classificationResult.rule_confidence || undefined,
            similarity_score: classificationResult.similarity_score || undefined,
            alternate_classifications: classificationResult.alternate_classifications || undefined,
          });

          await updateClassificationRunStatus(classificationRunId, 'completed');

          // Auto-approve if enabled and confidence meets threshold
          const rawConfidence = primaryCandidate.confidence || primaryCandidate.score || classificationResponse.max_confidence || 0;
          const userMetadata = await getUserMetadata(user.id);
          const threshold = userMetadata?.confidence_threshold ?? 0.8;
          if (userMetadata?.auto_approve_single && rawConfidence >= threshold) {
            await saveClassificationApproval(
              productId,
              classResultId,
              true,
              `Auto-approved: confidence (${Math.round(rawConfidence * 100)}%) is above ${Math.round(threshold * 100)}% threshold`
            );
            setWasAutoApproved(true);
          }
        }
      }

      setIsProcessingClarification(false);
    } catch (error: any) {
      console.error('Clarification response error:', error);
      const errorMsg: ClarificationMessage = {
        step: currentStep || 'preprocess',
        type: 'system' as const,
        content: 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setClarificationMessages(prev => [...prev, errorMsg]);
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

    // Store in localStorage scoped to user for persistence (Fix #6)
    const getStorageKey = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user ? `priorityReviews_${user.id}` : 'priorityReviews';
    };
    getStorageKey().then(key => {
      const existingReviews = JSON.parse(localStorage.getItem(key) || '[]');
      existingReviews.push(reviewItem);
      localStorage.setItem(key, JSON.stringify(existingReviews));
    });

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
    <div className="space-y-5">
      {/* Input Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">New Product Intake</h2>
            <p className="text-xs text-slate-400 mt-0.5">Fill in the details below for an accurate AI classification</p>
          </div>
          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100">Single Product</span>
        </div>

        <div className="p-6 space-y-5">
          {/* Product Name — required, primary */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">Product Name</label>
              <span className="text-xs text-red-400 font-medium">Required</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleClassifyClick()}
                placeholder="e.g. Wireless Bluetooth Speaker, Organic Cotton T-Shirt..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 placeholder:text-slate-300"
              />
            </div>
            {!query.trim() && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Organic cotton t-shirt', 'Stainless steel water bottle', 'LED desk lamp'].map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
                    className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs hover:bg-slate-200 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Product Description <span className="text-slate-400 font-normal">— optional but strongly recommended</span>
            </label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Describe the product's intended use, materials, and function in detail. More context = higher classification accuracy.&#10;&#10;e.g. Portable wireless speaker with Bluetooth 5.0. ABS plastic body with aluminum grille. Built-in 2,000mAh rechargeable battery, dual 10W drivers, IPX7 waterproof rating. Designed for outdoor recreational use."
              rows={4}
              className="w-full px-3.5 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-700 placeholder:text-slate-300 leading-relaxed"
            />
          </div>

          {/* Row: Origin + SKU */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <MapPin className="w-3.5 h-3.5 inline-block mr-1 text-slate-400" />
                Country of Origin
              </label>
              <select
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 bg-white"
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
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <Package className="w-3.5 h-3.5 inline-block mr-1 text-slate-400" />
                SKU Number
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. PROD-12345"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Row: Unit Cost + Vendor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 inline-block mr-1 text-slate-400" />
                Unit Value
              </label>
              <input
                type="text"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="e.g. $24.99"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder:text-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. TechSupply Co."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Materials accordion */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-700">Material Composition</span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-full">Improves Accuracy</span>
                {materials.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{materials.length} added</span>
                )}
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showAdvanced && (
              <div className="p-4 bg-white space-y-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">Textile, metals, and plastics classifications often depend on material breakdown.</p>
                {materials.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-1">
                    {materials.map((material, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">
                        {material.material} {material.percentage}%
                        <button onClick={() => removeMaterial(idx)} className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <span className={`text-xs font-medium ${getTotalPercentage(materials) === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      Total: {getTotalPercentage(materials)}%
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Material (e.g. Cotton, Steel, ABS Plastic)"
                    value={newMaterial.material}
                    onChange={(e) => setNewMaterial({ ...newMaterial, material: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="%"
                    min="0"
                    max="100"
                    value={newMaterial.percentage || ''}
                    onChange={(e) => setNewMaterial({ ...newMaterial, percentage: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                  <button
                    onClick={addMaterial}
                    disabled={!newMaterial.material || newMaterial.percentage <= 0}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-sm font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* File upload */}
          <div className="border-2 border-dashed border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Upload className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Supporting Documents <span className="text-slate-400 font-normal">(optional)</span></p>
                  <p className="text-xs text-slate-400">Specs, BOMs, datasheets — PDF, Excel, CSV, Word</p>
                </div>
              </div>
              <label htmlFor="file-upload-single" className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors cursor-pointer">
                Browse
              </label>
              <input id="file-upload-single" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" />
            </div>
            {uploadedFiles.length > 0 && (
              <div className="px-4 pb-4 space-y-2 border-t border-dashed border-slate-200 pt-3">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-slate-100">
                    {getFileIcon(file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={() => removeFile(idx)} className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <button
              onClick={handleReviewLater}
              disabled={!result}
              className="px-4 py-2.5 text-slate-500 hover:text-slate-700 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Save as Draft
            </button>
            <button
              onClick={handleClassifyClick}
              disabled={loading || !query.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm font-semibold shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Classifying...' : 'Run Classification'}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-12 h-12 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-800">{loadingSteps[loadingStepIndex] || 'Classifying...'}</p>
          <p className="text-xs text-slate-400 mt-1">Analyzing product data and fetching CBP rulings</p>
        </div>
      )}

      {/* Clarification chatbot */}
      {needsClarification && !loading && (
        <ClarificationChatbot
          messages={clarificationMessages}
          onSendMessage={handleClarificationResponse}
          isLoading={isProcessingClarification}
          partialMatches={partialMatches}
        />
      )}

      {/* Results */}
      {result && !loading && !needsClarification && (
        <div className="space-y-4">
          {/* Clarification history (if applicable) */}
          {clarificationMessages.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Clarification History</p>
              <ClarificationChatbot
                messages={clarificationMessages}
                onSendMessage={async () => {}}
                isLoading={false}
              />
            </div>
          )}

          {/* Auto-approved banner */}
          {wasAutoApproved && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">Auto-Approved</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Confidence ({result.confidence}%) meets your threshold. Manage this in Settings › Auto Approve.
                </p>
              </div>
            </div>
          )}

          <ClassificationResults
            result={result}
            onApprove={wasAutoApproved ? undefined : async () => {
              if (result && classificationRunId) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  try {
                    const { data: products } = await supabase
                      .from('user_products')
                      .select('id')
                      .eq('classification_run_id', classificationRunId)
                      .eq('user_id', user.id)
                      .limit(1)
                      .single();
                    const { data: classResult } = await supabase
                      .from('user_product_classification_results')
                      .select('id')
                      .eq('classification_run_id', classificationRunId)
                      .limit(1)
                      .single();
                    if (products && classResult) {
                      await saveClassificationApproval(products.id, classResult.id, true, 'Manually approved by user');
                    }
                  } catch (error) {
                    console.error('Error saving approval:', error);
                  }
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
                  setWasAutoApproved(false);
                }
              }
            }}
            onReviewLater={wasAutoApproved ? undefined : handleReviewLater}
          />
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !needsClarification && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Ready to classify</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Enter a product name above and click Run Classification to get an AI-powered HTS code with confidence scoring and tariff data.</p>
        </div>
      )}

      {/* Review Later toast */}
      {showReviewLaterConfirmation && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-emerald-600 text-white px-5 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Saved for Review</p>
              <p className="text-xs text-emerald-100 mt-0.5">Added to your priority review list</p>
            </div>
          </div>
        </div>
      )}

      <IntendedUseModal
        isOpen={showIntendedUseModal}
        onClose={() => setShowIntendedUseModal(false)}
        onConfirm={handleModalConfirm}
        productName={query}
        mode="single"
      />
    </div>
  );
}