import { useState, useEffect, useRef, useCallback } from 'react';
import { Package, Upload, FileSpreadsheet, X, File, FileText, Plus, CheckCircle, Sparkles, AlertCircle, Clock, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { ClassificationView } from './ClassificationView';
import { BulkUpload } from './BulkUpload';
import { BulkRunDetailView } from './BulkRunDetailView';
import { getUserBulkRuns, getRunProductsForRerun, type BulkRunSummary, type RerunProduct } from '../lib/classificationService';
import { useBulkClassification } from '../lib/BulkClassificationContext';
import { supabase } from '../lib/supabase';

type InputMode = 'manual' | 'file';

interface UnifiedClassificationProps {
  chatClassificationResult?: any;
  onChatResultConsumed?: () => void;
}

export function UnifiedClassification({ chatClassificationResult, onChatResultConsumed }: UnifiedClassificationProps = {}) {
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [bulkDescription, setBulkDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [showBulkResults, setShowBulkResults] = useState(false);

  // Bulk runs history
  const [bulkRuns, setBulkRuns] = useState<BulkRunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  // Run detail view (click on completed run)
  const [selectedRun, setSelectedRun] = useState<BulkRunSummary | null>(null);

  // Rerun state
  const [rerunningRunId, setRerunningRunId] = useState<number | null>(null);
  const [rerunProducts, setRerunProducts] = useState<RerunProduct[] | null>(null);
  const [rerunFileName, setRerunFileName] = useState<string | null>(null);

  // Context — bulk classification loop state (persists across navigation)
  const { processing, progressCurrent, progressTotal, items, fileName: contextFileName } = useBulkClassification();

  // ── Load bulk runs ────────────────────────────────────────────────────────

  const loadBulkRuns = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const runs = await getUserBulkRuns(user.id);
        setBulkRuns(runs);
      }
    } catch (err) {
      console.error('Error loading bulk runs:', err);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadBulkRuns();
  }, [loadBulkRuns]);

  // ── Poll every 5 seconds while any run is in_progress ─────────────────────

  useEffect(() => {
    const hasInProgress = bulkRuns.some(r => r.status === 'in_progress') || processing;
    if (!hasInProgress) return;

    const interval = setInterval(() => {
      loadBulkRuns();
    }, 5000);

    return () => clearInterval(interval);
  }, [bulkRuns, processing, loadBulkRuns]);

  // ── Refresh runs when processing finishes ─────────────────────────────────

  const prevProcessing = useRef(processing);
  useEffect(() => {
    if (prevProcessing.current && !processing) {
      // Run just finished — refresh the list
      loadBulkRuns();
    }
    prevProcessing.current = processing;
  }, [processing, loadBulkRuns]);

  // ── If context is processing and user navigates back, show BulkUpload ─────

  useEffect(() => {
    if (processing && inputMode === 'manual' && !showBulkResults) {
      // Auto-switch to bulk view so user sees progress
      setInputMode('file');
      setShowBulkResults(true);
    }
  }, [processing]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const mainFile = files.find(f =>
      f.name.endsWith('.csv') ||
      f.name.endsWith('.xlsx') ||
      f.name.endsWith('.xls') ||
      f.name.endsWith('.pdf')
    );

    if (mainFile) {
      setUploadedFile(mainFile);
      setInputMode('file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setUploadedFile(files[0]);
      setInputMode('file');
    }
  };

  const handleSupportingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSupportingFiles([...supportingFiles, ...Array.from(files)]);
    }
  };

  const removeSupportingFile = (index: number) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileName: string) => {
    const parts = fileName.split('.');
    const ext = parts.length > 0 && parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileText className="w-4 h-4 text-green-600" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <File className="w-4 h-4 text-slate-600" />;
  };

  const resetToManual = () => {
    setUploadedFile(null);
    setSupportingFiles([]);
    setBulkDescription('');
    setInputMode('manual');
    setShowBulkResults(false);
  };

  const startBulkClassification = () => {
    setShowBulkResults(true);
  };

  const formatRunDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getEstimatedTime = (run: BulkRunSummary) => {
    if (run.classifiedCount === 0 || run.totalItems === 0) return 'Estimating...';
    const elapsed = Date.now() - new Date(run.created_at).getTime();
    const avgPerItem = elapsed / run.classifiedCount;
    const remaining = run.totalItems - run.classifiedCount;
    const remainingMs = avgPerItem * remaining;
    const remainingMins = Math.ceil(remainingMs / 60000);
    if (remainingMins < 1) return '< 1 min remaining';
    return `~${remainingMins} min remaining`;
  };

  const handleRunClick = (run: BulkRunSummary) => {
    if (run.status !== 'completed') return;
    setSelectedRun(selectedRun?.id === run.id ? null : run);
  };

  const handleRerun = async (run: BulkRunSummary) => {
    setRerunningRunId(run.id);
    try {
      const products = await getRunProductsForRerun(run.id);
      if (products.length === 0) {
        setRerunningRunId(null);
        return;
      }
      setRerunProducts(products);
      setRerunFileName(run.fileName);
      setInputMode('file');
      setShowBulkResults(true);
    } catch (err) {
      console.error('Error loading products for rerun:', err);
      setRerunningRunId(null);
    }
  };

  const getRunStatusDisplay = (run: BulkRunSummary) => {
    if (run.status === 'completed') {
      return { label: 'Classified', color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="w-4 h-4 text-green-600" /> };
    }
    if (run.status === 'failed') {
      return { label: 'Failed', color: 'text-red-700 bg-red-50 border-red-200', icon: <AlertCircle className="w-4 h-4 text-red-600" /> };
    }
    if (run.status === 'cancelled') {
      return { label: 'Cancelled', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: <X className="w-4 h-4 text-slate-500" /> };
    }
    if (run.status === 'in_progress') {
      return { label: 'In Progress', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: <Clock className="w-4 h-4 text-blue-600" /> };
    }
    return { label: 'Failed', color: 'text-red-700 bg-red-50 border-red-200', icon: <AlertCircle className="w-4 h-4 text-red-600" /> };
  };

  // Show bulk results if we're in file mode and user has started classification
  // OR if a bulk run is active in the context (navigated back from another page)
  if (inputMode === 'file' && showBulkResults) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <BulkUpload
            initialFile={uploadedFile}
            initialSupportingFiles={supportingFiles}
            autoStart={!!uploadedFile}
            rerunProducts={rerunProducts || undefined}
            rerunFileName={rerunFileName || undefined}
          />
        </div>
      </div>
    );
  }

  // Show full-screen detail view when a completed run is selected
  if (selectedRun) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <BulkRunDetailView
            run={selectedRun}
            onClose={() => setSelectedRun(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-slate-900 mb-2">Product Classification</h1>
          <p className="text-slate-600">Classify products with natural language or upload bulk files for AI-powered HS/HTS classification</p>
        </div>

        {/* Active Classification Banner — shows when a run is processing in the background */}
        {processing && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 mb-6 border-2 border-blue-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                </div>
                <div>
                  <h3 className="text-blue-900 mb-1">Bulk Classification In Progress</h3>
                  <p className="text-blue-700 text-sm">
                    {contextFileName || 'File'} &mdash; {progressCurrent} of {progressTotal} products classified
                  </p>
                  {progressTotal > 0 && (
                    <div className="mt-2 w-48">
                      <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${(progressCurrent / progressTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setInputMode('file');
                  setShowBulkResults(true);
                }}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                View Progress
              </button>
            </div>
          </div>
        )}

        {/* Bulk Upload Button - Always Visible */}
        {!uploadedFile && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 mb-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-lg">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white mb-1">Need to classify multiple products?</h3>
                  <p className="text-blue-100 text-sm">Upload a CSV, Excel, or PDF file for bulk classification</p>
                </div>
              </div>
              <label className="px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer inline-flex items-center gap-2 shadow-lg">
                <FileSpreadsheet className="w-5 h-5" />
                Upload File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* File Upload Mode */}
        {uploadedFile && !showBulkResults && (
          <div className="space-y-6">
            {/* Main File Card */}
            <div className="bg-white rounded-xl p-6 border-2 border-green-200 bg-green-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="text-slate-900">Ready to Classify</h4>
                    <p className="text-slate-600 text-sm">{uploadedFile.name}</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetToManual}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Choose Different File
                </button>
              </div>
            </div>

            {/* Product Description */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <div>
                    <h4 className="text-slate-900">General Product Description (Optional)</h4>
                    <p className="text-slate-600 text-sm">Describe the products' intended use, materials, or function</p>
                  </div>
                </div>
              </div>
              <textarea
                value={bulkDescription}
                onChange={(e) => setBulkDescription(e.target.value)}
                placeholder="Example: These are consumer electronics products made primarily of ABS plastic and electronic components. They are intended for indoor/outdoor recreational use and feature wireless connectivity. Most items include rechargeable lithium batteries."
                rows={4}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                This general description will be applied to all products in your upload to improve classification accuracy
              </p>
            </div>

            {/* Supporting Documents */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <div>
                    <h4 className="text-slate-900">Supporting Documents (Optional)</h4>
                    <p className="text-slate-600 text-sm">Specs, BOMs, datasheets to improve accuracy</p>
                  </div>
                </div>
                <label
                  htmlFor="supporting-files-upload"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Files
                </label>
                <input
                  id="supporting-files-upload"
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  onChange={handleSupportingFileUpload}
                  className="hidden"
                />
              </div>

              {supportingFiles.length > 0 ? (
                <div className="space-y-2">
                  {supportingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                      {getFileIcon(file.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm truncate">{file.name}</p>
                        <p className="text-slate-500 text-xs">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => removeSupportingFile(idx)}
                        className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
                  <p className="text-slate-500 text-sm">
                    No supporting documents uploaded
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    These documents help the AI better understand your products
                  </p>
                </div>
              )}
            </div>

            {/* Start Classification Button */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-slate-900 mb-1">Ready to Start</h4>
                  <p className="text-slate-600 text-sm">
                    {bulkDescription && supportingFiles.length > 0
                      ? `Main file + description + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : bulkDescription
                      ? 'Main file + description ready for classification'
                      : supportingFiles.length > 0
                      ? `Main file + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : 'Main file ready for classification'}
                  </p>
                </div>
                <button
                  onClick={startBulkClassification}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Start Classification
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Entry Mode - Always Show When No File */}
        {!uploadedFile && (
          <div className="mb-6">
            <ClassificationView
              chatClassificationResult={chatClassificationResult}
              onChatResultConsumed={onChatResultConsumed}
            />
          </div>
        )}

        {/* Bulk Classification Runs History */}
        {!uploadedFile && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-slate-900">Bulk Classification Runs</h3>
              </div>

              {loadingRuns ? (
                <div className="p-6 text-center text-slate-500">Loading runs...</div>
              ) : bulkRuns.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No bulk classification runs yet</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {bulkRuns.map((run) => {
                    const statusDisplay = getRunStatusDisplay(run);
                    const isClickable = run.status === 'completed';
                    const isSelected = selectedRun?.id === run.id;
                    return (
                      <div
                        key={run.id}
                        onClick={() => isClickable && handleRunClick(run)}
                        className={`px-6 py-4 transition-colors ${
                          isClickable ? 'cursor-pointer hover:bg-slate-50' : ''
                        } ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg border ${statusDisplay.color}`}>
                              {statusDisplay.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-slate-900 truncate block">
                                {run.fileName}
                              </span>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                <span>
                                  {run.totalProducts} product{run.totalProducts !== 1 ? 's' : ''}
                                </span>
                                <span>&middot;</span>
                                <span>
                                  {formatRunDate(run.created_at)}
                                </span>
                                {run.status === 'in_progress' && (
                                  <>
                                    <span>&middot;</span>
                                    <span className="text-blue-600">
                                      {run.classifiedCount}/{run.totalItems} classified &mdash; {getEstimatedTime(run)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {run.status === 'failed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRerun(run);
                                }}
                                disabled={rerunningRunId === run.id}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {rerunningRunId === run.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Rerun
                              </button>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusDisplay.color}`}>
                              {statusDisplay.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
