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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={resetToManual}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Bulk Classification</h1>
              <p className="text-sm text-slate-500">Processing your file</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Product Classification</h1>
            <p className="text-sm text-slate-500 mt-0.5">AI-powered HTS classification for single products and bulk imports</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">

          {/* Resume Bulk Run Banner */}
          {activeBulkRun && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">Bulk Run In Progress</p>
                  <p className="text-xs text-amber-700 mt-0.5">{activeBulkRun.fileName} — {activeBulkRun.totalItems} products</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { localStorage.removeItem(BULK_RUN_KEY); setActiveBulkRun(null); }}
                  className="px-3 py-1.5 text-amber-700 hover:text-amber-900 text-sm transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleResumeBulkRun}
                  className="px-4 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Resume
                </button>
              </div>
            </div>
          )}

          {/* File mode: focused upload flow */}
          {uploadedFile && !showBulkResults && (
            <div className="max-w-3xl mx-auto space-y-5">
              {/* File selected card */}
              <div className="bg-white rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{uploadedFile.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{(uploadedFile.size / 1024).toFixed(1)} KB · Ready for classification</p>
                  </div>
                </div>
                <button onClick={resetToManual} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  Change file
                </button>
              </div>

              {/* Description */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <label className="block text-sm font-semibold text-slate-800 mb-1">General Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <p className="text-xs text-slate-400 mb-3">Applies to all products in this batch to improve accuracy</p>
                <textarea
                  value={bulkDescription}
                  onChange={(e) => setBulkDescription(e.target.value)}
                  placeholder="e.g. Consumer electronics made of ABS plastic with wireless connectivity, for indoor recreational use..."
                  rows={3}
                  className="w-full px-3.5 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-700 placeholder:text-slate-300"
                />
              </div>

              {/* Supporting docs */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Supporting Documents <span className="text-slate-400 font-normal">(optional)</span></label>
                    <p className="text-xs text-slate-400 mt-0.5">Specs, BOMs, or datasheets to improve accuracy</p>
                  </div>
                  <label htmlFor="supporting-files-upload" className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </label>
                  <input id="supporting-files-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png" onChange={handleSupportingFileUpload} className="hidden" />
                </div>
                {supportingFiles.length > 0 ? (
                  <div className="space-y-2">
                    {supportingFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        {getFileIcon(file.name)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 truncate">{file.name}</p>
                          <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={() => removeSupportingFile(idx)} className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0">
                          <X className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-5 border-2 border-dashed border-slate-100 rounded-lg text-center">
                    <p className="text-sm text-slate-400">No supporting documents added</p>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button onClick={resetToManual} className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleBulkClassifyClick}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-semibold shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Run Classification
                </button>
              </div>
            </div>
          )}

          {/* Manual mode: two-column layout */}
          {!uploadedFile && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start max-w-[1400px] mx-auto">
              {/* Left: single product classification form */}
              <div>
                <ClassificationView
                  chatClassificationResult={chatClassificationResult}
                  onChatResultConsumed={onChatResultConsumed}
                />
              </div>

              {/* Right: bulk upload + history sidebar */}
              <div className="space-y-5 xl:sticky xl:top-0">
                {/* Bulk classification CTA */}
                <div className="bg-slate-900 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Bulk Classification</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Classify many products at once</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Upload a CSV or Excel file with product names, descriptions, and origins to classify in batch.
                  </p>
                  <label className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors cursor-pointer text-sm font-semibold">
                    <FileSpreadsheet className="w-4 h-4" />
                    Upload File
                    <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>

                {/* Bulk runs history */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Recent Bulk Runs</h3>
                  </div>
                  {loadingRuns ? (
                    <div className="p-5 text-center text-sm text-slate-400">Loading...</div>
                  ) : bulkRuns.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <FileSpreadsheet className="w-5 h-5 text-slate-300" />
                      </div>
                      <p className="text-sm text-slate-500">No bulk runs yet</p>
                      <p className="text-xs text-slate-400 mt-1">Upload a file to get started</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {bulkRuns.map((run) => {
                        const statusDisplay = getRunStatusDisplay(run);
                        return (
                          <div key={run.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-slate-800 truncate font-medium">{run.fileName}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {run.classifiedCount} classified · {formatTimeAgo(run.created_at)}
                                </p>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 mt-0.5 ${statusDisplay.color}`}>
                                {statusDisplay.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
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
