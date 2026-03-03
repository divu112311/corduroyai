import { useState, useEffect } from 'react';
import { Package, Upload, FileSpreadsheet, X, File, FileText, Plus, CheckCircle, Sparkles, AlertCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { ClassificationView } from './ClassificationView';
import { BulkUpload } from './BulkUpload';
import { IntendedUseModal, IntendedUseAnswers, buildIntendedUseText } from './IntendedUseModal';
import { getUserBulkRuns, type BulkRunSummary } from '../lib/classificationService';
import { supabase } from '../lib/supabase';

type InputMode = 'manual' | 'file';

interface BulkItem {
  id: number;
  productName: string;
  description: string;
  status: 'pending' | 'complete' | 'exception';
  hts?: string;
  confidence?: number;
  tariff?: string;
  origin?: string;
  materials?: string;
  cost?: string;
}

interface UnifiedClassificationProps {
  chatClassificationResult?: any;
  onChatResultConsumed?: () => void;
}

const BULK_RUN_KEY = 'corduroy_bulk_run';

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

  // Intended use modal state for bulk flow
  const [showBulkIntendedUseModal, setShowBulkIntendedUseModal] = useState(false);
  const [intendedUseContext, setIntendedUseContext] = useState('');

  // Check for active bulk run in localStorage (for resume banner)
  const [activeBulkRun, setActiveBulkRun] = useState<{
    runId: number; fileName: string; totalItems: number;
  } | null>(() => {
    try {
      const stored = localStorage.getItem(BULK_RUN_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // Load bulk runs history on mount
  useEffect(() => {
    const loadBulkRuns = async () => {
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
    };
    loadBulkRuns();
  }, []);

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

  const handleBulkClassifyClick = () => {
    setShowBulkIntendedUseModal(true);
  };

  const handleBulkModalConfirm = (answers: IntendedUseAnswers) => {
    setShowBulkIntendedUseModal(false);
    const ctx = answers.primaryUse ? buildIntendedUseText(answers) : '';
    setIntendedUseContext(ctx);
    startBulkClassification();
  };

  const handleResumeBulkRun = () => {
    // Switch to BulkUpload view — it will auto-resume from localStorage
    setInputMode('file');
    setShowBulkResults(true);
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getRunStatusDisplay = (run: BulkRunSummary) => {
    if (run.status === 'completed' && run.classifiedCount > 0) {
      return { label: 'Classified', color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="w-4 h-4 text-green-600" /> };
    }
    if (run.status === 'completed' && run.classifiedCount === 0) {
      return { label: 'Failed', color: 'text-red-700 bg-red-50 border-red-200', icon: <AlertCircle className="w-4 h-4 text-red-600" /> };
    }
    if (run.status === 'cancelled') {
      return { label: 'Cancelled', color: 'text-red-700 bg-red-50 border-red-200', icon: <X className="w-4 h-4 text-red-600" /> };
    }
    if (run.status === 'in_progress') {
      return { label: 'In Progress', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: <Clock className="w-4 h-4 text-blue-600" /> };
    }
    // Fallback — treat as failed if no classifiedCount
    return { label: 'Failed', color: 'text-red-700 bg-red-50 border-red-200', icon: <AlertCircle className="w-4 h-4 text-red-600" /> };
  };

  // Show bulk results if we're in file mode and user has started classification
  if (inputMode === 'file' && showBulkResults) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <BulkUpload
            initialFile={uploadedFile}
            initialSupportingFiles={supportingFiles}
            autoStart={!!uploadedFile}
            intendedUseContext={intendedUseContext}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200">
          <h1 className="text-slate-900 mb-1">Product Classification</h1>
          <p className="text-slate-500 text-sm">AI-powered HTS classification for single products and bulk imports</p>
        </div>

        {/* Resume Bulk Run Banner */}
        {activeBulkRun && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5 mb-6 border-2 border-amber-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-amber-100 p-3 rounded-lg">
                  <RefreshCw className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-amber-900 mb-1">Bulk Run In Progress</h3>
                  <p className="text-amber-700 text-sm">
                    {activeBulkRun.fileName} &mdash; {activeBulkRun.totalItems} products
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    localStorage.removeItem(BULK_RUN_KEY);
                    setActiveBulkRun(null);
                  }}
                  className="px-4 py-2 text-amber-700 hover:text-amber-900 transition-colors text-sm"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleResumeBulkRun}
                  className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Resume
                </button>
              </div>
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
                  onClick={handleBulkClassifyClick}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-sm font-medium"
                >
                  <Sparkles className="w-5 h-5" />
                  Run Classification
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-slate-900">Bulk Classification Runs</h3>
            </div>

            {loadingRuns ? (
              <div className="p-6 text-center text-slate-500">Loading runs...</div>
            ) : bulkRuns.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No bulk classification runs yet</div>
            ) : (
              <>
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 grid grid-cols-3 text-xs text-slate-500 font-medium uppercase tracking-wide">
                  <span>File</span>
                  <span>Results</span>
                  <span className="text-right">Status</span>
                </div>
              <div className="divide-y divide-slate-100">
                {bulkRuns.map((run) => {
                  const statusDisplay = getRunStatusDisplay(run);
                  return (
                    <div
                      key={run.id}
                      className="px-6 py-4 hover:bg-slate-50 transition-colors"
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
                                {run.classifiedCount} product{run.classifiedCount !== 1 ? 's' : ''} classified
                              </span>
                              <span>·</span>
                              <span>
                                {formatTimeAgo(run.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${statusDisplay.color}`}>
                          {statusDisplay.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        )}
      </div>

      <IntendedUseModal
        isOpen={showBulkIntendedUseModal}
        onClose={() => setShowBulkIntendedUseModal(false)}
        onConfirm={handleBulkModalConfirm}
        productName={uploadedFile?.name}
        mode="bulk"
      />
    </div>
  );
}
